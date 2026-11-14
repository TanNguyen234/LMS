"""Enforce one source grade per learner and assessment.

Revision ID: 6f2d4db8312a
Revises: efd8af3f19c3
Create Date: 2026-10-21
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "6f2d4db8312a"
down_revision: Union[str, Sequence[str], None] = "efd8af3f19c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not context.is_offline_mode():
        connection = op.get_bind()
        duplicates = connection.execute(sa.text("""
            SELECT TOP 1 CourseId, StudentId, SourceType, SourceId, COUNT(*) AS DuplicateCount
            FROM dbo.Grades
            WHERE SourceId IS NOT NULL
            GROUP BY CourseId, StudentId, SourceType, SourceId
            HAVING COUNT(*) > 1
        """)).first()
        if duplicates:
            raise RuntimeError(
                "Cannot add UQ_Grades_Source_Learner: duplicate assessment grades exist; "
                "reconcile those rows before applying this migration."
            )

        unsupported_questions = connection.execute(sa.text("""
            SELECT TOP 1 QuestionId
            FROM dbo.QuizQuestions
            WHERE QuestionType NOT IN ('SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_TEXT')
        """)).first()
        if unsupported_questions:
            raise RuntimeError(
                "Cannot restrict CK_QuizQuestions_Type while unsupported question types exist; "
                "review those quiz questions before applying this migration."
            )

    op.execute(sa.text("""
        IF OBJECT_ID('dbo.CK_QuizQuestions_Type', 'C') IS NOT NULL
            ALTER TABLE dbo.QuizQuestions DROP CONSTRAINT CK_QuizQuestions_Type;
    """))
    op.execute(sa.text("""
        ALTER TABLE dbo.QuizQuestions
        ADD CONSTRAINT CK_QuizQuestions_Type CHECK (QuestionType IN ('SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_TEXT'));
    """))
    op.execute(sa.text("""
        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE name = 'UQ_Grades_Source_Learner' AND object_id = OBJECT_ID('dbo.Grades')
        )
        CREATE UNIQUE INDEX UQ_Grades_Source_Learner
        ON dbo.Grades (CourseId, StudentId, SourceType, SourceId)
        WHERE SourceId IS NOT NULL;
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        IF EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE name = 'UQ_Grades_Source_Learner' AND object_id = OBJECT_ID('dbo.Grades')
        )
        DROP INDEX UQ_Grades_Source_Learner ON dbo.Grades;
    """))
    op.execute(sa.text("""
        IF OBJECT_ID('dbo.CK_QuizQuestions_Type', 'C') IS NOT NULL
            ALTER TABLE dbo.QuizQuestions DROP CONSTRAINT CK_QuizQuestions_Type;
    """))
    op.execute(sa.text("""
        ALTER TABLE dbo.QuizQuestions
        ADD CONSTRAINT CK_QuizQuestions_Type CHECK (QuestionType IN ('SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_TEXT'));
    """))
