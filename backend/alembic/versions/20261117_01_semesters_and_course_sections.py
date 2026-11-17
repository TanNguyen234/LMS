"""Add AcademicSemesters table and Course term/section uniqueness.

Revision ID: 20261117_01
Revises: 20261113_01
Create Date: 2026-11-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261117_01"
down_revision: Union[str, Sequence[str], None] = "20261113_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            IF OBJECT_ID('dbo.AcademicSemesters', 'U') IS NULL
            BEGIN
                CREATE TABLE dbo.AcademicSemesters (
                    SemesterId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_AcademicSemesters PRIMARY KEY,
                    Code VARCHAR(30) NOT NULL,
                    Name NVARCHAR(100) NOT NULL,
                    Semester VARCHAR(20) NOT NULL,
                    AcademicYear VARCHAR(20) NOT NULL,
                    StartDate DATETIME2(0) NOT NULL,
                    EndDate DATETIME2(0) NOT NULL,
                    GraceDays INT NOT NULL CONSTRAINT DF_AcademicSemesters_GraceDays DEFAULT 14,
                    Status VARCHAR(20) NOT NULL CONSTRAINT DF_AcademicSemesters_Status DEFAULT 'ACTIVE',
                    IsCurrent BIT NOT NULL CONSTRAINT DF_AcademicSemesters_IsCurrent DEFAULT 0,
                    AutoArchiveOnExpire BIT NOT NULL CONSTRAINT DF_AcademicSemesters_AutoArchive DEFAULT 1,
                    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AcademicSemesters_CreatedAt DEFAULT SYSUTCDATETIME(),
                    CONSTRAINT UQ_AcademicSemesters_Code UNIQUE (Code),
                    CONSTRAINT CK_AcademicSemesters_Status CHECK (Status IN ('UPCOMING','ACTIVE','ARCHIVED')),
                    CONSTRAINT CK_AcademicSemesters_GraceDays CHECK (GraceDays BETWEEN 0 AND 90),
                    CONSTRAINT CK_AcademicSemesters_Dates CHECK (EndDate > StartDate)
                );
            END
            """
        )
    )

    op.execute(
        sa.text(
            """
            IF COL_LENGTH('dbo.Courses', 'SemesterId') IS NULL
            BEGIN
                ALTER TABLE dbo.Courses ADD SemesterId UNIQUEIDENTIFIER NULL;
            END

            IF COL_LENGTH('dbo.Courses', 'SectionCode') IS NULL
            BEGIN
                ALTER TABLE dbo.Courses ADD SectionCode VARCHAR(20) NOT NULL CONSTRAINT DF_Courses_SectionCode DEFAULT '';
            END

            IF NOT EXISTS (
                SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Courses_AcademicSemester'
            )
            BEGIN
                ALTER TABLE dbo.Courses
                ADD CONSTRAINT FK_Courses_AcademicSemester
                FOREIGN KEY (SemesterId) REFERENCES dbo.AcademicSemesters(SemesterId);
            END

            -- Drop legacy single-column unique constraints/indexes on Courses.CourseCode
            DECLARE @dropCourseCodeUq NVARCHAR(MAX) = N'';
            SELECT @dropCourseCodeUq = @dropCourseCodeUq + N'ALTER TABLE dbo.Courses DROP CONSTRAINT ' + QUOTENAME(kc.name) + N';'
            FROM sys.key_constraints kc
            JOIN sys.index_columns ic ON kc.parent_object_id = ic.object_id AND kc.unique_index_id = ic.index_id
            JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            WHERE kc.parent_object_id = OBJECT_ID('dbo.Courses')
              AND kc.type = 'UQ'
              AND c.name = 'CourseCode'
              AND (SELECT COUNT(*) FROM sys.index_columns ic2 WHERE ic2.object_id = ic.object_id AND ic2.index_id = ic.index_id) = 1;

            SELECT @dropCourseCodeUq = @dropCourseCodeUq + N'DROP INDEX ' + QUOTENAME(i.name) + N' ON dbo.Courses;'
            FROM sys.indexes i
            JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            WHERE i.object_id = OBJECT_ID('dbo.Courses')
              AND i.is_unique = 1
              AND i.is_unique_constraint = 0
              AND i.is_primary_key = 0
              AND c.name = 'CourseCode'
              AND (SELECT COUNT(*) FROM sys.index_columns ic2 WHERE ic2.object_id = ic.object_id AND ic2.index_id = ic.index_id) = 1;

            IF LEN(@dropCourseCodeUq) > 0 EXEC sp_executesql @dropCourseCodeUq;

            IF NOT EXISTS (
                SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_Courses_Code_Section_Term' AND parent_object_id = OBJECT_ID('dbo.Courses')
            )
            BEGIN
                ALTER TABLE dbo.Courses
                ADD CONSTRAINT UQ_Courses_Code_Section_Term UNIQUE (CourseCode, Semester, AcademicYear, SectionCode);
            END

            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes WHERE name = 'IX_Courses_CourseCode' AND object_id = OBJECT_ID('dbo.Courses')
            )
            BEGIN
                CREATE INDEX IX_Courses_CourseCode ON dbo.Courses(CourseCode);
            END

            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes WHERE name = 'IX_Courses_SemesterId' AND object_id = OBJECT_ID('dbo.Courses')
            )
            BEGIN
                CREATE INDEX IX_Courses_SemesterId ON dbo.Courses(SemesterId);
            END
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_Courses_Code_Section_Term' AND parent_object_id = OBJECT_ID('dbo.Courses'))
                ALTER TABLE dbo.Courses DROP CONSTRAINT UQ_Courses_Code_Section_Term;
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Courses_SemesterId' AND object_id = OBJECT_ID('dbo.Courses'))
                DROP INDEX IX_Courses_SemesterId ON dbo.Courses;
            IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Courses_CourseCode' AND object_id = OBJECT_ID('dbo.Courses'))
                DROP INDEX IX_Courses_CourseCode ON dbo.Courses;
            IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Courses_AcademicSemester')
                ALTER TABLE dbo.Courses DROP CONSTRAINT FK_Courses_AcademicSemester;
            IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Courses_Semester')
                ALTER TABLE dbo.Courses DROP CONSTRAINT FK_Courses_Semester;

            IF COL_LENGTH('dbo.Courses', 'SemesterId') IS NOT NULL
            BEGIN
                DECLARE @dfSemSql NVARCHAR(MAX) = N'';
                SELECT @dfSemSql = @dfSemSql + N'ALTER TABLE dbo.Courses DROP CONSTRAINT ' + QUOTENAME(dc.name) + N';'
                FROM sys.default_constraints dc
                JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
                WHERE dc.parent_object_id = OBJECT_ID('dbo.Courses') AND c.name = 'SemesterId';
                IF LEN(@dfSemSql) > 0 EXEC sp_executesql @dfSemSql;
                ALTER TABLE dbo.Courses DROP COLUMN SemesterId;
            END

            IF COL_LENGTH('dbo.Courses', 'SectionCode') IS NOT NULL
            BEGIN
                DECLARE @dfSecSql NVARCHAR(MAX) = N'';
                SELECT @dfSecSql = @dfSecSql + N'ALTER TABLE dbo.Courses DROP CONSTRAINT ' + QUOTENAME(dc.name) + N';'
                FROM sys.default_constraints dc
                JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
                WHERE dc.parent_object_id = OBJECT_ID('dbo.Courses') AND c.name = 'SectionCode';
                IF LEN(@dfSecSql) > 0 EXEC sp_executesql @dfSecSql;
                ALTER TABLE dbo.Courses DROP COLUMN SectionCode;
            END

            IF OBJECT_ID('dbo.AcademicSemesters', 'U') IS NOT NULL
                DROP TABLE dbo.AcademicSemesters;
            """
        )
    )
