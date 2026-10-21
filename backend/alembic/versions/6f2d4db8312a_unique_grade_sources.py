"""Enforce one source grade per learner and assessment.

Revision ID: 6f2d4db8312a
Revises: efd8af3f19c3
Create Date: 2026-10-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6f2d4db8312a"
down_revision: Union[str, Sequence[str], None] = "efd8af3f19c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    duplicates = connection.execute(sa.text("""
        SELECT TOP 1 CourseId, StudentId, SourceType, SourceId, COUNT(*) AS RowCount
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
        WHERE QuestionType NOT IN ('SINGLE_CHOICE', 'TRUE_FALSE')
    """)).first()
    if unsupported_questions:
        raise RuntimeError(
            "Cannot restrict CK_QuizQuestions_Type while unsupported question types exist; "
            "review those quiz questions before applying this migration."
        )

    op.drop_constraint("CK_QuizQuestions_Type", "QuizQuestions", type_="check")
    op.create_check_constraint(
        "CK_QuizQuestions_Type",
        "QuizQuestions",
        "QuestionType IN ('SINGLE_CHOICE', 'TRUE_FALSE')",
    )

    op.create_index(
        "UQ_Grades_Source_Learner",
        "Grades",
        ["CourseId", "StudentId", "SourceType", "SourceId"],
        unique=True,
        mssql_where=sa.text("SourceId IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("UQ_Grades_Source_Learner", table_name="Grades")
    op.drop_constraint("CK_QuizQuestions_Type", "QuizQuestions", type_="check")
    op.create_check_constraint(
        "CK_QuizQuestions_Type",
        "QuizQuestions",
        "QuestionType IN ('SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_TEXT')",
    )
