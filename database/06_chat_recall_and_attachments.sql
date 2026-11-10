-- ==============================================================================
-- Migration: 06_chat_recall_and_attachments.sql
-- Description: Add message recall & attachment support to Messages table
-- ==============================================================================

USE UniversityLms;
GO

-- 1. Allow Content to be NULL (when message only has an attachment)
ALTER TABLE Messages ALTER COLUMN Content NVARCHAR(2000) NULL;
GO

-- 2. Add Recall tracking columns
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Messages') AND name = 'IsRecalled')
BEGIN
    ALTER TABLE Messages ADD IsRecalled BIT NOT NULL CONSTRAINT DF_Messages_IsRecalled DEFAULT 0;
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Messages') AND name = 'RecalledAt')
BEGIN
    ALTER TABLE Messages ADD RecalledAt DATETIME2 NULL;
END
GO

-- 3. Add Attachment columns
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Messages') AND name = 'AttachmentUrl')
BEGIN
    ALTER TABLE Messages ADD AttachmentUrl NVARCHAR(500) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Messages') AND name = 'AttachmentName')
BEGIN
    ALTER TABLE Messages ADD AttachmentName NVARCHAR(255) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Messages') AND name = 'AttachmentType')
BEGIN
    ALTER TABLE Messages ADD AttachmentType NVARCHAR(100) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Messages') AND name = 'AttachmentSize')
BEGIN
    ALTER TABLE Messages ADD AttachmentSize INT NULL;
END
GO

PRINT 'Migration 06_chat_recall_and_attachments completed successfully.';
GO
