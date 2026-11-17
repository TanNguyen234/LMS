"""Add CourseSessions timetable table.

Revision ID: 20261117_02
Revises: 20261117_01
Create Date: 2026-11-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261117_02"
down_revision: Union[str, Sequence[str], None] = "20261117_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            IF OBJECT_ID('dbo.CourseSessions', 'U') IS NULL
            BEGIN
                CREATE TABLE dbo.CourseSessions (
                    SessionId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_CourseSessions PRIMARY KEY,
                    CourseId UNIQUEIDENTIFIER NOT NULL,
                    Title NVARCHAR(200) NOT NULL,
                    SessionType VARCHAR(20) NOT NULL CONSTRAINT DF_CourseSessions_Type DEFAULT 'REGULAR',
                    DeliveryMode VARCHAR(20) NOT NULL CONSTRAINT DF_CourseSessions_Delivery DEFAULT 'IN_PERSON',
                    Room NVARCHAR(100) NULL,
                    StartAt DATETIME2(0) NOT NULL,
                    EndAt DATETIME2(0) NOT NULL,
                    Status VARCHAR(20) NOT NULL CONSTRAINT DF_CourseSessions_Status DEFAULT 'SCHEDULED',
                    Notes NVARCHAR(500) NULL,
                    CreatedBy UNIQUEIDENTIFIER NOT NULL,
                    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_CourseSessions_CreatedAt DEFAULT SYSUTCDATETIME(),
                    CONSTRAINT CK_CourseSessions_Type CHECK (SessionType IN ('REGULAR','MAKEUP','EXAM','ONLINE')),
                    CONSTRAINT CK_CourseSessions_Delivery CHECK (DeliveryMode IN ('IN_PERSON','ONLINE')),
                    CONSTRAINT CK_CourseSessions_Status CHECK (Status IN ('SCHEDULED','CANCELLED','COMPLETED')),
                    CONSTRAINT CK_CourseSessions_Window CHECK (EndAt > StartAt),
                    CONSTRAINT FK_CourseSessions_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId),
                    CONSTRAINT FK_CourseSessions_Creator FOREIGN KEY (CreatedBy) REFERENCES dbo.Users(UserId)
                );
                CREATE INDEX IX_CourseSessions_CourseId ON dbo.CourseSessions(CourseId);
                CREATE INDEX IX_CourseSessions_StartAt ON dbo.CourseSessions(StartAt);
            END
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            IF OBJECT_ID('dbo.CourseSessions', 'U') IS NOT NULL
                DROP TABLE dbo.CourseSessions;
            """
        )
    )
