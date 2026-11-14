"""Unified idempotent schema upgrade to 19 Unicode tables.

Revision ID: 20261113_01
Revises: 6f2d4db8312a
Create Date: 2026-11-13
"""
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "20261113_01"
down_revision: Union[str, Sequence[str], None] = "6f2d4db8312a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _backup_legacy_messages_if_present() -> None:
    """Persist legacy dbo.Messages rows locally before dropping codex/split leftovers."""
    if context.is_offline_mode():
        return
    connection = op.get_bind()
    exists = connection.execute(
        sa.text("SELECT OBJECT_ID('dbo.Messages', 'U')")
    ).scalar()
    if not exists:
        return

    rows = connection.execute(sa.text("SELECT * FROM dbo.Messages")).mappings().all()
    if not rows:
        return

    backup_dir = Path(__file__).resolve().parents[2] / "storage" / "legacy_backup"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_file = backup_dir / "codex_split_messages_backup.json"
    serialized = [
        {key: (val.isoformat() if hasattr(val, "isoformat") else str(val) if val is not None else None) for key, val in row.items()}
        for row in rows
    ]
    backup_file.write_text(
        json.dumps(
            {
                "backedUpAtUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "table": "dbo.Messages",
                "rowCount": len(serialized),
                "rows": serialized,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def _drop_table_if_exists_sql(table_name: str) -> str:
    return f"""
    IF OBJECT_ID('dbo.{table_name}', 'U') IS NOT NULL
    BEGIN
        DECLARE @fkSql NVARCHAR(MAX) = N'';
        SELECT @fkSql = @fkSql + N'ALTER TABLE dbo.' + QUOTENAME(OBJECT_NAME(fk.parent_object_id))
            + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
        FROM sys.foreign_keys fk
        WHERE fk.parent_object_id = OBJECT_ID('dbo.{table_name}')
           OR fk.referenced_object_id = OBJECT_ID('dbo.{table_name}');
        IF LEN(@fkSql) > 0 EXEC sp_executesql @fkSql;
        DROP TABLE dbo.{table_name};
    END
    """


def _drop_column_if_exists_sql(table_name: str, column_name: str) -> str:
    return f"""
    IF COL_LENGTH('dbo.{table_name}', '{column_name}') IS NOT NULL
    BEGIN
        DECLARE @dropSql NVARCHAR(MAX) = N'';

        SELECT @dropSql = @dropSql + N'ALTER TABLE dbo.{table_name} DROP CONSTRAINT ' + QUOTENAME(dc.name) + N';'
        FROM sys.default_constraints dc
        JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
        WHERE dc.parent_object_id = OBJECT_ID('dbo.{table_name}') AND c.name = '{column_name}';

        SELECT @dropSql = @dropSql + N'ALTER TABLE dbo.{table_name} DROP CONSTRAINT ' + QUOTENAME(cc.name) + N';'
        FROM sys.check_constraints cc
        WHERE cc.parent_object_id = OBJECT_ID('dbo.{table_name}')
          AND cc.definition LIKE '%{column_name}%';

        SELECT @dropSql = @dropSql + N'ALTER TABLE dbo.' + QUOTENAME(OBJECT_NAME(fk.parent_object_id))
            + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
        JOIN sys.columns pc ON fkc.parent_object_id = pc.object_id AND fkc.parent_column_id = pc.column_id
        WHERE (fk.parent_object_id = OBJECT_ID('dbo.{table_name}') AND pc.name = '{column_name}')
           OR (fk.referenced_object_id = OBJECT_ID('dbo.{table_name}') AND EXISTS (
               SELECT 1 FROM sys.columns rc
               WHERE rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id AND rc.name = '{column_name}'
           ));

        SELECT @dropSql = @dropSql + N'DROP INDEX ' + QUOTENAME(i.name) + N' ON dbo.{table_name};'
        FROM sys.indexes i
        JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE i.object_id = OBJECT_ID('dbo.{table_name}') AND c.name = '{column_name}'
          AND i.is_primary_key = 0 AND i.is_unique_constraint = 0;

        IF LEN(@dropSql) > 0 EXEC sp_executesql @dropSql;
        ALTER TABLE dbo.{table_name} DROP COLUMN {column_name};
    END
    """


def _drop_check_for_column_sql(table_name: str, column_hint: str) -> str:
    return f"""
    IF OBJECT_ID('dbo.{table_name}', 'U') IS NOT NULL
    BEGIN
        DECLARE @ckSql NVARCHAR(MAX) = N'';
        SELECT @ckSql = @ckSql + N'ALTER TABLE dbo.{table_name} DROP CONSTRAINT ' + QUOTENAME(cc.name) + N';'
        FROM sys.check_constraints cc
        WHERE cc.parent_object_id = OBJECT_ID('dbo.{table_name}')
          AND cc.definition LIKE '%{column_hint}%';
        IF LEN(@ckSql) > 0 EXEC sp_executesql @ckSql;
    END
    """


def _upgrade_datetime_to_datetime2_sql(table_name: str, column_name: str, nullable: bool, default_expr: str = "") -> str:
    null_sql = "NULL" if nullable else "NOT NULL"
    readd_default = ""
    if default_expr:
        df_name = f"DF_{table_name}_{column_name}"
        readd_default = f"""
        IF OBJECT_ID('dbo.{df_name}', 'D') IS NULL
            ALTER TABLE dbo.{table_name} ADD CONSTRAINT {df_name} DEFAULT {default_expr} FOR {column_name};
        """
    return f"""
    IF EXISTS (
        SELECT 1 FROM sys.columns c
        WHERE c.object_id = OBJECT_ID('dbo.{table_name}')
          AND c.name = '{column_name}'
          AND TYPE_NAME(c.user_type_id) = 'datetime'
    )
    BEGIN
        DECLARE @dtSql NVARCHAR(MAX) = N'';
        SELECT @dtSql = @dtSql + N'ALTER TABLE dbo.{table_name} DROP CONSTRAINT ' + QUOTENAME(dc.name) + N';'
        FROM sys.default_constraints dc
        JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
        WHERE dc.parent_object_id = OBJECT_ID('dbo.{table_name}') AND c.name = '{column_name}';
        IF LEN(@dtSql) > 0 EXEC sp_executesql @dtSql;
        ALTER TABLE dbo.{table_name} ALTER COLUMN {column_name} DATETIME2(0) {null_sql};
        {readd_default}
    END
    """


def upgrade() -> None:
    # 1. Backup and remove leftover tables/columns from codex/split
    _backup_legacy_messages_if_present()
    op.execute(sa.text(_drop_table_if_exists_sql("Messages")))
    op.execute(sa.text(_drop_table_if_exists_sql("BlockedUsers")))

    leftover_columns = [
        ("Users", "Cohort"),
        ("Users", "Major"),
        ("Users", "ClassName"),
        ("Users", "Department"),
        ("Users", "IsChatEnabled"),
        ("Courses", "SubjectCode"),
        ("Courses", "SectionCode"),
        ("Courses", "IsDeleted"),
        ("Courses", "DeletedAt"),
        ("Courses", "DeletedBy"),
        ("Modules", "IsDeleted"),
        ("Modules", "DeletedAt"),
        ("Modules", "DeletedBy"),
        ("Lessons", "IsDeleted"),
        ("Lessons", "DeletedAt"),
        ("Lessons", "DeletedBy"),
        ("Assignments", "IsDeleted"),
        ("Assignments", "DeletedAt"),
        ("Assignments", "DeletedBy"),
        ("Quizzes", "TotalScore"),
        ("Quizzes", "IsDeleted"),
        ("Quizzes", "DeletedAt"),
        ("Quizzes", "DeletedBy"),
    ]
    for tbl, col in leftover_columns:
        op.execute(sa.text(_drop_column_if_exists_sql(tbl, col)))

    # 2. Ensure Meetings, MeetingLogs, CourseMessages exist and use Unicode + DATETIME2(0)
    op.execute(sa.text("""
        IF OBJECT_ID('dbo.Meetings', 'U') IS NULL
        CREATE TABLE dbo.Meetings (
            MeetingId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Meetings PRIMARY KEY,
            CourseId UNIQUEIDENTIFIER NOT NULL,
            HostId UNIQUEIDENTIFIER NOT NULL,
            Title NVARCHAR(200) NOT NULL,
            RoomCode VARCHAR(100) NOT NULL,
            Status VARCHAR(20) NOT NULL CONSTRAINT DF_Meetings_Status DEFAULT 'LIVE',
            StartedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Meetings_StartedAt DEFAULT SYSUTCDATETIME(),
            EndedAt DATETIME2(0) NULL,
            CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Meetings_CreatedAt DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_Meetings_Status CHECK (Status IN ('SCHEDULED','LIVE','ENDED')),
            CONSTRAINT FK_Meetings_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId),
            CONSTRAINT FK_Meetings_Host FOREIGN KEY (HostId) REFERENCES dbo.Users(UserId)
        );
    """))
    op.execute(sa.text(_upgrade_datetime_to_datetime2_sql("Meetings", "StartedAt", False, "SYSUTCDATETIME()")))
    op.execute(sa.text(_upgrade_datetime_to_datetime2_sql("Meetings", "EndedAt", True)))
    op.execute(sa.text(_upgrade_datetime_to_datetime2_sql("Meetings", "CreatedAt", False, "SYSUTCDATETIME()")))

    op.execute(sa.text("""
        IF OBJECT_ID('dbo.MeetingLogs', 'U') IS NULL
        CREATE TABLE dbo.MeetingLogs (
            LogId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_MeetingLogs PRIMARY KEY,
            MeetingId UNIQUEIDENTIFIER NOT NULL,
            UserId UNIQUEIDENTIFIER NOT NULL,
            JoinedAt DATETIME2(0) NOT NULL CONSTRAINT DF_MeetingLogs_JoinedAt DEFAULT SYSUTCDATETIME(),
            LeftAt DATETIME2(0) NULL,
            DurationSeconds INT NOT NULL CONSTRAINT DF_MeetingLogs_DurationSeconds DEFAULT 0,
            ChatCount INT NOT NULL CONSTRAINT DF_MeetingLogs_ChatCount DEFAULT 0,
            HandRaisesCount INT NOT NULL CONSTRAINT DF_MeetingLogs_HandRaisesCount DEFAULT 0,
            ActivitySummary NVARCHAR(500) NULL,
            CONSTRAINT CK_MeetingLogs_NonNegative CHECK (DurationSeconds >= 0 AND ChatCount >= 0 AND HandRaisesCount >= 0),
            CONSTRAINT FK_MeetingLogs_Meeting FOREIGN KEY (MeetingId) REFERENCES dbo.Meetings(MeetingId),
            CONSTRAINT FK_MeetingLogs_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
        );
    """))
    op.execute(sa.text(_upgrade_datetime_to_datetime2_sql("MeetingLogs", "JoinedAt", False, "SYSUTCDATETIME()")))
    op.execute(sa.text(_upgrade_datetime_to_datetime2_sql("MeetingLogs", "LeftAt", True)))

    op.execute(sa.text("""
        IF OBJECT_ID('dbo.CourseMessages', 'U') IS NULL
        CREATE TABLE dbo.CourseMessages (
            MessageId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_CourseMessages PRIMARY KEY,
            CourseId UNIQUEIDENTIFIER NOT NULL,
            SenderId UNIQUEIDENTIFIER NOT NULL,
            Content NVARCHAR(MAX) NOT NULL,
            AttachmentUrl NVARCHAR(500) NULL,
            CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_CourseMessages_CreatedAt DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_CourseMessages_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId),
            CONSTRAINT FK_CourseMessages_Sender FOREIGN KEY (SenderId) REFERENCES dbo.Users(UserId)
        );
    """))
    op.execute(sa.text(_upgrade_datetime_to_datetime2_sql("CourseMessages", "CreatedAt", False, "SYSUTCDATETIME()")))
    op.execute(sa.text("""
        IF EXISTS (
            SELECT 1 FROM sys.columns c
            WHERE c.object_id = OBJECT_ID('dbo.CourseMessages')
              AND c.name = 'AttachmentUrl'
              AND TYPE_NAME(c.user_type_id) <> 'nvarchar'
        )
        ALTER TABLE dbo.CourseMessages ALTER COLUMN AttachmentUrl NVARCHAR(500) NULL;
    """))

    # 3. Ensure StoredFiles, WhiteboardSnapshots, LessonProgress, AiInteractionLogs exist
    op.execute(sa.text("""
        IF OBJECT_ID('dbo.StoredFiles', 'U') IS NULL
        CREATE TABLE dbo.StoredFiles (
            FileId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_StoredFiles PRIMARY KEY,
            OwnerId UNIQUEIDENTIFIER NOT NULL,
            CourseId UNIQUEIDENTIFIER NULL,
            Scope VARCHAR(30) NOT NULL,
            OriginalName NVARCHAR(255) NOT NULL,
            StoredPath NVARCHAR(500) NOT NULL,
            MimeType VARCHAR(120) NOT NULL,
            SizeBytes BIGINT NOT NULL,
            Sha256 VARCHAR(64) NOT NULL,
            ExtractedText NVARCHAR(MAX) NULL,
            CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StoredFiles_CreatedAt DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_StoredFiles_Scope CHECK (Scope IN ('LESSON','ASSIGNMENT','SUBMISSION','CHAT','SEED')),
            CONSTRAINT CK_StoredFiles_SizeBytes CHECK (SizeBytes > 0),
            CONSTRAINT FK_StoredFiles_Owner FOREIGN KEY (OwnerId) REFERENCES dbo.Users(UserId),
            CONSTRAINT FK_StoredFiles_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId)
        );
    """))

    op.execute(sa.text("""
        IF OBJECT_ID('dbo.WhiteboardSnapshots', 'U') IS NULL
        CREATE TABLE dbo.WhiteboardSnapshots (
            SnapshotId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_WhiteboardSnapshots PRIMARY KEY,
            CourseId UNIQUEIDENTIFIER NOT NULL,
            MeetingId UNIQUEIDENTIFIER NULL,
            StrokesJson NVARCHAR(MAX) NOT NULL CONSTRAINT DF_WhiteboardSnapshots_StrokesJson DEFAULT N'[]',
            UpdatedBy UNIQUEIDENTIFIER NOT NULL,
            UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_WhiteboardSnapshots_UpdatedAt DEFAULT SYSUTCDATETIME(),
            CONSTRAINT FK_WhiteboardSnapshots_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId),
            CONSTRAINT FK_WhiteboardSnapshots_Meeting FOREIGN KEY (MeetingId) REFERENCES dbo.Meetings(MeetingId),
            CONSTRAINT FK_WhiteboardSnapshots_Updater FOREIGN KEY (UpdatedBy) REFERENCES dbo.Users(UserId)
        );
    """))

    op.execute(sa.text("""
        IF OBJECT_ID('dbo.LessonProgress', 'U') IS NULL
        CREATE TABLE dbo.LessonProgress (
            ProgressId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_LessonProgress PRIMARY KEY,
            LessonId UNIQUEIDENTIFIER NOT NULL,
            StudentId UNIQUEIDENTIFIER NOT NULL,
            IsCompleted BIT NOT NULL CONSTRAINT DF_LessonProgress_IsCompleted DEFAULT 0,
            CompletedAt DATETIME2(0) NULL,
            LastViewedAt DATETIME2(0) NOT NULL CONSTRAINT DF_LessonProgress_LastViewedAt DEFAULT SYSUTCDATETIME(),
            TimeSpentSeconds INT NOT NULL CONSTRAINT DF_LessonProgress_TimeSpent DEFAULT 0,
            CONSTRAINT UQ_LessonProgress_Lesson_Student UNIQUE (LessonId, StudentId),
            CONSTRAINT CK_LessonProgress_TimeSpent CHECK (TimeSpentSeconds >= 0),
            CONSTRAINT FK_LessonProgress_Lesson FOREIGN KEY (LessonId) REFERENCES dbo.Lessons(LessonId),
            CONSTRAINT FK_LessonProgress_Student FOREIGN KEY (StudentId) REFERENCES dbo.Users(UserId)
        );
    """))

    op.execute(sa.text("""
        IF OBJECT_ID('dbo.AiInteractionLogs', 'U') IS NULL
        CREATE TABLE dbo.AiInteractionLogs (
            LogId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_AiInteractionLogs PRIMARY KEY,
            UserId UNIQUEIDENTIFIER NOT NULL,
            CourseId UNIQUEIDENTIFIER NULL,
            Feature VARCHAR(40) NOT NULL,
            ProviderMode VARCHAR(30) NOT NULL,
            PromptSummary NVARCHAR(500) NOT NULL,
            CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AiInteractionLogs_CreatedAt DEFAULT SYSUTCDATETIME(),
            CONSTRAINT CK_AiInteractionLogs_Feature CHECK (Feature IN ('LESSON_TUTOR','QUIZ_GENERATOR','GRADING_FEEDBACK')),
            CONSTRAINT CK_AiInteractionLogs_Provider CHECK (ProviderMode IN ('GEMINI','LOCAL_FALLBACK')),
            CONSTRAINT FK_AiInteractionLogs_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),
            CONSTRAINT FK_AiInteractionLogs_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId)
        );
    """))

    # 4. Extend existing tables (column additions separated from constraints/indexes to prevent deferred compile errors)
    # 4.1 Courses
    op.execute(sa.text("""
        IF COL_LENGTH('dbo.Courses', 'JoinCode') IS NULL
            ALTER TABLE dbo.Courses ADD JoinCode VARCHAR(20) NULL;
        IF COL_LENGTH('dbo.Courses', 'AllowSelfEnroll') IS NULL
            ALTER TABLE dbo.Courses ADD AllowSelfEnroll BIT NOT NULL CONSTRAINT DF_Courses_AllowSelfEnroll DEFAULT 0;
        IF COL_LENGTH('dbo.Courses', 'MaxStudents') IS NULL
            ALTER TABLE dbo.Courses ADD MaxStudents INT NULL;
        IF COL_LENGTH('dbo.Courses', 'Category') IS NULL
            ALTER TABLE dbo.Courses ADD Category NVARCHAR(100) NULL;
    """))
    op.execute(sa.text("""
        IF OBJECT_ID('dbo.CK_Courses_MaxStudents', 'C') IS NULL
            EXEC(N'ALTER TABLE dbo.Courses ADD CONSTRAINT CK_Courses_MaxStudents CHECK (MaxStudents IS NULL OR MaxStudents > 0);');
        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE name = 'UQ_Courses_JoinCode' AND object_id = OBJECT_ID('dbo.Courses')
        )
            EXEC(N'CREATE UNIQUE INDEX UQ_Courses_JoinCode ON dbo.Courses(JoinCode) WHERE JoinCode IS NOT NULL;');
    """))

    # 4.2 Lessons
    op.execute(sa.text("""
        IF COL_LENGTH('dbo.Lessons', 'ContentType') IS NULL
            ALTER TABLE dbo.Lessons ADD ContentType VARCHAR(20) NOT NULL CONSTRAINT DF_Lessons_ContentType DEFAULT 'TEXT';
        IF COL_LENGTH('dbo.Lessons', 'AttachmentFileId') IS NULL
            ALTER TABLE dbo.Lessons ADD AttachmentFileId UNIQUEIDENTIFIER NULL;
    """))
    op.execute(sa.text("""
        IF OBJECT_ID('dbo.CK_Lessons_ContentType', 'C') IS NULL
            EXEC(N'ALTER TABLE dbo.Lessons ADD CONSTRAINT CK_Lessons_ContentType CHECK (ContentType IN (''TEXT'',''PDF'',''VIDEO'',''SLIDE''));');
        IF OBJECT_ID('dbo.FK_Lessons_AttachmentFile', 'F') IS NULL
            EXEC(N'ALTER TABLE dbo.Lessons ADD CONSTRAINT FK_Lessons_AttachmentFile FOREIGN KEY (AttachmentFileId) REFERENCES dbo.StoredFiles(FileId);');
    """))

    # 4.3 Assignments
    op.execute(sa.text("""
        IF COL_LENGTH('dbo.Assignments', 'WeightPercent') IS NULL
            ALTER TABLE dbo.Assignments ADD WeightPercent DECIMAL(5,2) NULL;
        IF COL_LENGTH('dbo.Assignments', 'AttachmentFileId') IS NULL
            ALTER TABLE dbo.Assignments ADD AttachmentFileId UNIQUEIDENTIFIER NULL;
        IF COL_LENGTH('dbo.Assignments', 'RubricJson') IS NULL
            ALTER TABLE dbo.Assignments ADD RubricJson NVARCHAR(MAX) NULL;
    """))
    op.execute(sa.text("""
        IF OBJECT_ID('dbo.CK_Assignments_WeightPercent', 'C') IS NULL
            EXEC(N'ALTER TABLE dbo.Assignments ADD CONSTRAINT CK_Assignments_WeightPercent CHECK (WeightPercent IS NULL OR (WeightPercent >= 0 AND WeightPercent <= 100));');
        IF OBJECT_ID('dbo.FK_Assignments_AttachmentFile', 'F') IS NULL
            EXEC(N'ALTER TABLE dbo.Assignments ADD CONSTRAINT FK_Assignments_AttachmentFile FOREIGN KEY (AttachmentFileId) REFERENCES dbo.StoredFiles(FileId);');
    """))

    # 4.4 Submissions
    op.execute(sa.text("""
        IF COL_LENGTH('dbo.Submissions', 'FileId') IS NULL
            ALTER TABLE dbo.Submissions ADD FileId UNIQUEIDENTIFIER NULL;
        IF COL_LENGTH('dbo.Submissions', 'RubricScoresJson') IS NULL
            ALTER TABLE dbo.Submissions ADD RubricScoresJson NVARCHAR(MAX) NULL;
    """))
    op.execute(sa.text("""
        IF OBJECT_ID('dbo.FK_Submissions_File', 'F') IS NULL
            EXEC(N'ALTER TABLE dbo.Submissions ADD CONSTRAINT FK_Submissions_File FOREIGN KEY (FileId) REFERENCES dbo.StoredFiles(FileId);');
    """))

    # 4.5 Quizzes (keep and normalize ScoreVisibility, add WeightPercent)
    op.execute(sa.text("""
        IF COL_LENGTH('dbo.Quizzes', 'WeightPercent') IS NULL
            ALTER TABLE dbo.Quizzes ADD WeightPercent DECIMAL(5,2) NULL;
        IF COL_LENGTH('dbo.Quizzes', 'ScoreVisibility') IS NULL
            ALTER TABLE dbo.Quizzes ADD ScoreVisibility VARCHAR(30) NOT NULL CONSTRAINT DF_Quizzes_ScoreVisibility DEFAULT 'AFTER_CLOSE';
    """))
    op.execute(sa.text(_drop_check_for_column_sql("Quizzes", "ScoreVisibility")))
    op.execute(sa.text("""
        DECLARE @dfQuizSql NVARCHAR(MAX) = N'';
        SELECT @dfQuizSql = @dfQuizSql + N'ALTER TABLE dbo.Quizzes DROP CONSTRAINT ' + QUOTENAME(dc.name) + N';'
        FROM sys.default_constraints dc
        JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
        WHERE dc.parent_object_id = OBJECT_ID('dbo.Quizzes') AND c.name = 'ScoreVisibility';
        IF LEN(@dfQuizSql) > 0 EXEC sp_executesql @dfQuizSql;

        EXEC(N'UPDATE dbo.Quizzes SET ScoreVisibility = ''AFTER_ATTEMPT'' WHERE ScoreVisibility = ''IMMEDIATE'' OR ScoreVisibility IS NULL;');
        EXEC(N'ALTER TABLE dbo.Quizzes ALTER COLUMN ScoreVisibility VARCHAR(30) NOT NULL;');
        EXEC(N'ALTER TABLE dbo.Quizzes ADD CONSTRAINT DF_Quizzes_ScoreVisibility DEFAULT ''AFTER_CLOSE'' FOR ScoreVisibility;');
        EXEC(N'ALTER TABLE dbo.Quizzes ADD CONSTRAINT CK_Quizzes_ScoreVisibility CHECK (ScoreVisibility IN (''SCORE_ONLY'',''AFTER_ATTEMPT'',''AFTER_CLOSE''));');
        IF OBJECT_ID('dbo.CK_Quizzes_WeightPercent', 'C') IS NULL
            EXEC(N'ALTER TABLE dbo.Quizzes ADD CONSTRAINT CK_Quizzes_WeightPercent CHECK (WeightPercent IS NULL OR (WeightPercent >= 0 AND WeightPercent <= 100));');
    """))

    # 4.6 QuizQuestions, QuizAttempts, Grades, Modules, Lessons SortOrder
    op.execute(sa.text(_drop_check_for_column_sql("QuizQuestions", "QuestionType")))
    op.execute(sa.text("""
        ALTER TABLE dbo.QuizQuestions
        ADD CONSTRAINT CK_QuizQuestions_Type CHECK (QuestionType IN ('SINGLE_CHOICE','TRUE_FALSE','SHORT_TEXT'));
    """))

    op.execute(sa.text("""
        IF COL_LENGTH('dbo.QuizAttempts', 'QuestionResultsJson') IS NULL
            ALTER TABLE dbo.QuizAttempts ADD QuestionResultsJson NVARCHAR(MAX) NULL;
    """))
    op.execute(sa.text(_drop_check_for_column_sql("QuizAttempts", "Status")))
    op.execute(sa.text("""
        ALTER TABLE dbo.QuizAttempts
        ADD CONSTRAINT CK_QuizAttempts_Status CHECK (Status IN ('IN_PROGRESS','SUBMITTED','EXPIRED','PENDING_REVIEW'));
    """))

    op.execute(sa.text("""
        IF COL_LENGTH('dbo.Grades', 'ItemTitle') IS NULL
            ALTER TABLE dbo.Grades ADD ItemTitle NVARCHAR(200) NULL;
    """))
    op.execute(sa.text(_drop_check_for_column_sql("Grades", "SourceType")))
    op.execute(sa.text("""
        ALTER TABLE dbo.Grades
        ADD CONSTRAINT CK_Grades_SourceType CHECK (SourceType IN ('ASSIGNMENT','QUIZ','MIDTERM','FINAL','MANUAL'));
    """))

    # 4.7 CourseMessages extensions
    op.execute(sa.text("""
        IF COL_LENGTH('dbo.CourseMessages', 'MeetingId') IS NULL
            ALTER TABLE dbo.CourseMessages ADD MeetingId UNIQUEIDENTIFIER NULL;
        IF COL_LENGTH('dbo.CourseMessages', 'MessageType') IS NULL
            ALTER TABLE dbo.CourseMessages ADD MessageType VARCHAR(20) NOT NULL CONSTRAINT DF_CourseMessages_MessageType DEFAULT 'TEXT';
        IF COL_LENGTH('dbo.CourseMessages', 'AttachmentFileId') IS NULL
            ALTER TABLE dbo.CourseMessages ADD AttachmentFileId UNIQUEIDENTIFIER NULL;
    """))
    op.execute(sa.text("""
        IF OBJECT_ID('dbo.CK_CourseMessages_MessageType', 'C') IS NULL
            EXEC(N'ALTER TABLE dbo.CourseMessages ADD CONSTRAINT CK_CourseMessages_MessageType CHECK (MessageType IN (''TEXT'',''SYSTEM'',''FILE''));');
        IF OBJECT_ID('dbo.FK_CourseMessages_Meeting', 'F') IS NULL
            EXEC(N'ALTER TABLE dbo.CourseMessages ADD CONSTRAINT FK_CourseMessages_Meeting FOREIGN KEY (MeetingId) REFERENCES dbo.Meetings(MeetingId);');
        IF OBJECT_ID('dbo.FK_CourseMessages_AttachmentFile', 'F') IS NULL
            EXEC(N'ALTER TABLE dbo.CourseMessages ADD CONSTRAINT FK_CourseMessages_AttachmentFile FOREIGN KEY (AttachmentFileId) REFERENCES dbo.StoredFiles(FileId);');
    """))

    # 5. Ensure recommended indexes exist on both upgraded & fresh DBs
    index_specs = [
        ("IX_Courses_LecturerId", "Courses", "LecturerId"),
        ("IX_Enrollments_StudentId", "Enrollments", "StudentId"),
        ("IX_Modules_CourseId", "Modules", "CourseId"),
        ("IX_Lessons_ModuleId", "Lessons", "ModuleId"),
        ("IX_Assignments_CourseId", "Assignments", "CourseId"),
        ("IX_Submissions_StudentId", "Submissions", "StudentId"),
        ("IX_Quizzes_CourseId", "Quizzes", "CourseId"),
        ("IX_QuizQuestions_QuizId", "QuizQuestions", "QuizId"),
        ("IX_QuizAttempts_StudentId", "QuizAttempts", "StudentId"),
        ("IX_Grades_Course_Student", "Grades", "CourseId, StudentId"),
        ("IX_Notifications_User_Read", "Notifications", "UserId, IsRead, CreatedAt"),
        ("IX_Meetings_CourseId", "Meetings", "CourseId"),
        ("IX_Meetings_HostId", "Meetings", "HostId"),
        ("IX_Meetings_RoomCode", "Meetings", "RoomCode"),
        ("IX_MeetingLogs_MeetingId", "MeetingLogs", "MeetingId"),
        ("IX_MeetingLogs_UserId", "MeetingLogs", "UserId"),
        ("IX_CourseMessages_CourseId", "CourseMessages", "CourseId"),
        ("IX_CourseMessages_MeetingId", "CourseMessages", "MeetingId"),
        ("IX_CourseMessages_SenderId", "CourseMessages", "SenderId"),
        ("IX_StoredFiles_OwnerId", "StoredFiles", "OwnerId"),
        ("IX_StoredFiles_CourseId", "StoredFiles", "CourseId"),
        ("IX_WhiteboardSnapshots_CourseId", "WhiteboardSnapshots", "CourseId"),
        ("IX_WhiteboardSnapshots_MeetingId", "WhiteboardSnapshots", "MeetingId"),
        ("IX_LessonProgress_LessonId", "LessonProgress", "LessonId"),
        ("IX_LessonProgress_StudentId", "LessonProgress", "StudentId"),
        ("IX_AiInteractionLogs_UserId", "AiInteractionLogs", "UserId"),
        ("IX_AiInteractionLogs_CourseId", "AiInteractionLogs", "CourseId"),
    ]
    for idx_name, tbl_name, cols in index_specs:
        op.execute(sa.text(f"""
            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name = '{idx_name}' AND object_id = OBJECT_ID('dbo.{tbl_name}')
            )
            CREATE INDEX {idx_name} ON dbo.{tbl_name} ({cols});
        """))


def downgrade() -> None:
    op.execute(sa.text(_drop_column_if_exists_sql("CourseMessages", "AttachmentFileId")))
    op.execute(sa.text(_drop_column_if_exists_sql("CourseMessages", "MessageType")))
    op.execute(sa.text(_drop_column_if_exists_sql("CourseMessages", "MeetingId")))
    op.execute(sa.text(_drop_column_if_exists_sql("Grades", "ItemTitle")))
    op.execute(sa.text(_drop_column_if_exists_sql("QuizAttempts", "QuestionResultsJson")))
    op.execute(sa.text(_drop_column_if_exists_sql("Quizzes", "ScoreVisibility")))
    op.execute(sa.text(_drop_column_if_exists_sql("Quizzes", "WeightPercent")))
    op.execute(sa.text(_drop_column_if_exists_sql("Submissions", "RubricScoresJson")))
    op.execute(sa.text(_drop_column_if_exists_sql("Submissions", "FileId")))
    op.execute(sa.text(_drop_column_if_exists_sql("Assignments", "RubricJson")))
    op.execute(sa.text(_drop_column_if_exists_sql("Assignments", "AttachmentFileId")))
    op.execute(sa.text(_drop_column_if_exists_sql("Assignments", "WeightPercent")))
    op.execute(sa.text(_drop_column_if_exists_sql("Lessons", "AttachmentFileId")))
    op.execute(sa.text(_drop_column_if_exists_sql("Lessons", "ContentType")))
    op.execute(sa.text(_drop_column_if_exists_sql("Courses", "Category")))
    op.execute(sa.text(_drop_column_if_exists_sql("Courses", "MaxStudents")))
    op.execute(sa.text(_drop_column_if_exists_sql("Courses", "AllowSelfEnroll")))
    op.execute(sa.text(_drop_column_if_exists_sql("Courses", "JoinCode")))
    op.execute(sa.text(_drop_table_if_exists_sql("AiInteractionLogs")))
    op.execute(sa.text(_drop_table_if_exists_sql("LessonProgress")))
    op.execute(sa.text(_drop_table_if_exists_sql("WhiteboardSnapshots")))
    op.execute(sa.text(_drop_table_if_exists_sql("StoredFiles")))
