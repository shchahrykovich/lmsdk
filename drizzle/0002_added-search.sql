-- Custom SQL migration file, put your code below! --
CREATE VIRTUAL TABLE PromptExecutionLogsForSearch USING fts5(variableValue,
            logId UNINDEXED,
            variablePath UNINDEXED,
            tenantId UNINDEXED,
            projectId UNINDEXED,
            promptId UNINDEXED,
            createdAt UNINDEXED);
