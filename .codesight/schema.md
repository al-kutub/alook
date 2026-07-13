# Schema

### community_machine_token
- id: text (default, pk)
- userId: text (fk, required)
- machineId: text (fk)
- status: text (default, required)
- expiresAt: text (required)
- lastUsedAt: text
- _relations_: userId -> user.id

### community_machine
- id: text (default, pk)
- userId: text (fk, required)
- displayName: text (default, required)
- hostname: text (default, required)
- platform: text (default, required)
- arch: text (default, required)
- osRelease: text (default, required)
- daemonVersion: text (default, required)
- metadata: text
- availableRuntimes: text (default, required)
- status: text (default, required)
- lastSeenAt: text
- _relations_: userId -> user.id

### community_machine_credential
- id: text (default, pk)
- userId: text (fk, required)
- machineId: text (fk, required)
- credentialHash: text (unique, required)
- doName: text (unique, required)
- lastUsedAt: text
- revokedAt: text
- _relations_: userId -> user.id, machineId -> communityMachine.id

### community_bot_binding
- userId: text (fk, pk)
- machineId: text (fk, required)
- runtime: text (required)
- _relations_: userId -> user.id, machineId -> communityMachine.id

### community_agent_runner_key
- id: text (default, pk)
- userId: text (fk, required)
- machineId: text (fk, required)
- agentId: text (required, fk)
- runnerKeyHash: text (unique, required)
- doName: text (unique, required)
- revokedAt: text
- _relations_: userId -> user.id, machineId -> communityMachine.id

### community_server
- id: text (default, pk)
- name: text (required)
- description: text (default)
- icon: text
- ownerId: text (fk, required)
- _relations_: ownerId -> user.id

### community_category
- id: text (default, pk)
- serverId: text (fk, required)
- name: text (required)
- position: integer (default)
- private: integer (default)
- creatorId: text (fk)
- _relations_: serverId -> communityServer.id, creatorId -> user.id

### community_channel
- id: text (default, pk)
- serverId: text (fk, required)
- categoryId: text (fk)
- name: text (required)
- type: text (default, required)
- topic: text (default)
- position: integer (default)
- forumTags: text
- parentChannelId: text (fk)
- creatorId: text (fk)
- messageCount: integer (default)
- archived: integer (default)
- parentMessageId: text (fk)
- lastMessageAt: text
- _relations_: serverId -> communityServer.id, categoryId -> communityCategory.id, parentChannelId -> communityChannel.id, creatorId -> user.id

### community_channel_member
- id: text (default, pk)
- channelId: text (fk, required)
- userId: text (fk, required)
- addedBy: text (fk)
- addedAt: text (default, required)
- _relations_: channelId -> communityChannel.id, userId -> user.id, addedBy -> user.id

### community_dm_conversation
- id: text (default, pk)
- user1Id: text (fk)
- user2Id: text (fk)
- lastMessageAt: text
- _relations_: user1Id -> user.id, user2Id -> user.id

### community_message
- id: text (default, pk)
- authorId: text (fk, required)
- content: text (default, required)
- type: text (default, required)
- mentionType: text
- replyToId: text (fk)
- embeds: text
- flags: integer (default)
- channelId: text (fk)
- dmConversationId: text (fk)
- seq: integer (default, required)
- _relations_: authorId -> user.id, channelId -> communityChannel.id, dmConversationId -> communityDmConversation.id

### community_message_seq
- scopeKey: text (pk)
- nextSeq: integer (required)

### community_server_member
- id: text (default, pk)
- serverId: text (fk, required)
- userId: text (fk, required)
- role: text (default)
- nickname: text
- railOrder: integer (default)
- joinedAt: text (default, required)
- _relations_: serverId -> communityServer.id, userId -> user.id

### community_server_folder
- id: text (default, pk)
- userId: text (fk, required)
- name: text (required)
- position: integer (default)
- _relations_: userId -> user.id

### community_server_folder_item
- folderId: text (fk, required)
- serverId: text (fk, required)
- position: integer (default)
- _relations_: folderId -> communityServerFolder.id, serverId -> communityServer.id

### community_server_invite
- id: text (default, pk)
- serverId: text (fk, required)
- createdBy: text (fk)
- token: text (default, required, unique)
- maxUses: integer
- uses: integer (default)
- expiresAt: text
- _relations_: serverId -> communityServer.id, createdBy -> user.id

### community_friendship
- id: text (default, pk)
- requesterId: text (fk, required)
- addresseeId: text (fk, required)
- status: text (default, required)
- blockerId: text (fk)
- _relations_: requesterId -> user.id, addresseeId -> user.id

### community_read_state
- id: text (default, pk)
- userId: text (fk, required)
- channelId: text (fk)
- dmConversationId: text (fk)
- lastReadAt: text (required)
- lastReadMessageId: text (fk)
- lastReadSeq: integer (default, required)
- _relations_: userId -> user.id, channelId -> communityChannel.id, dmConversationId -> communityDmConversation.id

### community_reaction
- id: text (default, pk)
- messageId: text (fk, required)
- userId: text (fk, required)
- emoji: text (required)
- _relations_: messageId -> communityMessage.id, userId -> user.id

### community_attachment
- id: text (default, pk)
- messageId: text (fk, required)
- filename: text (required)
- url: text (required)
- contentType: text
- size: integer
- width: integer
- height: integer
- _relations_: messageId -> communityMessage.id

### community_pin
- id: text (default, pk)
- channelId: text (fk, required)
- messageId: text (fk, required)
- pinnedBy: text (fk)
- _relations_: channelId -> communityChannel.id, messageId -> communityMessage.id, pinnedBy -> user.id

### community_mention
- id: text (default, pk)
- messageId: text (fk, required)
- userId: text (fk, required)
- kind: text (default, required)
- read: integer (default)
- _relations_: messageId -> communityMessage.id, userId -> user.id

### community_user_profile
- userId: text (fk, pk)
- aboutMe: text (default)
- bannerColor: text
- statusEmoji: text
- statusText: text (default)
- _relations_: userId -> user.id

### community_notification_setting
- id: text (default, pk)
- userId: text (fk, required)
- serverId: text (fk)
- channelId: text (fk)
- level: text (default, required)
- _relations_: userId -> user.id, serverId -> communityServer.id, channelId -> communityChannel.id

### community_audit_log
- id: text (default, pk)
- serverId: text (fk)
- actorId: text (fk)
- action: text (required)
- targetType: text (required)
- targetId: text (required, fk)
- changes: text
- reason: text
- _relations_: serverId -> communityServer.id, actorId -> user.id

### community_bot_approval_request
- id: text (default, pk)
- botId: text (fk, required)
- kind: text (required)
- serverId: text (fk)
- requestedByUserId: text (fk, required)
- dmMessageId: text (fk, required)
- status: text (default, required)
- resolvedAt: text
- _relations_: botId -> user.id, serverId -> communityServer.id, requestedByUserId -> user.id, dmMessageId -> communityMessage.id

### user
- id: text (default, pk)
- name: text (default, required)
- email: text (required, unique)
- emailVerified: integer
- image: text
- isBot: integer (default, required)
- ownerUserId: text (fk)
- discriminator: text (default, required)
- _relations_: ownerUserId -> user.id

### session
- id: text (default, pk)
- userId: text (fk, required)
- token: text (required, unique)
- expiresAt: text (required)
- ipAddress: text
- userAgent: text
- _relations_: userId -> user.id

### account
- id: text (default, pk)
- userId: text (fk, required)
- accountId: text (required, fk)
- providerId: text (required, fk)
- accessToken: text
- refreshToken: text
- accessTokenExpiresAt: text
- refreshTokenExpiresAt: text
- scope: text
- idToken: text
- password: text
- _relations_: userId -> user.id

### verification
- id: text (default, pk)
- identifier: text (required)
- value: text (required)
- expiresAt: text (required)

### workspace
- id: text (default, pk)
- name: text (required)
- slug: text (required, unique)
- onboarded: integer (default, required)

### member
- id: text (default, pk)
- workspaceId: text (fk, required)
- userId: text (fk, required)
- role: text (default, required)
- globalInstruction: text (default, required)
- _relations_: workspaceId -> workspace.id, userId -> user.id

### workspace_invite
- id: text (default, pk)
- workspaceId: text (fk, required)
- token: text (default, required, unique)
- createdBy: text (fk, required)
- usedBy: text (fk)
- usedAt: text
- expiresAt: text (required)
- _relations_: workspaceId -> workspace.id, createdBy -> user.id, usedBy -> user.id

### agent_access
- id: text (default, pk)
- agentId: text (required, fk)
- workspaceId: text (required, fk)
- userId: text (fk, required)
- _relations_: userId -> user.id

### agent_pin
- id: text (default, pk)
- agentId: text (required, fk)
- workspaceId: text (required, fk)
- userId: text (fk, required)
- position: integer (default, required)
- _relations_: userId -> user.id

### agent_sidebar_order
- id: text (default, pk)
- agentId: text (required, fk)
- workspaceId: text (required, fk)
- userId: text (fk, required)
- position: integer (default, required)
- _relations_: userId -> user.id

### machine
- daemonId: text (required, fk)
- workspaceId: text (fk, required)
- deviceInfo: text (default, required)
- lastSeenAt: text
- pendingUpdateVersion: text
- pendingRescan: integer (default)
- ownerId: text (fk)
- _relations_: workspaceId -> workspace.id, ownerId -> user.id

### agent_runtime
- id: text (default, pk)
- workspaceId: text (fk, required)
- daemonId: text (required, fk)
- runtimeMode: text (default, required)
- provider: text (required)
- deviceInfo: text (default, required)
- metadata: text
- _relations_: workspaceId -> workspace.id

### agent
- id: text (default, required)
- workspaceId: text (fk, required)
- name: text (required)
- description: text (default, required)
- instructions: text (default, required)
- avatarUrl: text
- runtimeId: text (fk)
- runtimeMode: text (default, required)
- runtimeConfig: text
- visibility: text (default, required)
- status: text (default, required)
- maxConcurrentTasks: integer (default, required)
- ownerId: text (fk)
- tools: text
- triggers: text
- emailHandle: text (unique)
- heartbeatEnabled: integer (default, required)
- heartbeatIntervalSeconds: integer (default, required)
- lastHeartbeatAt: text
- _relations_: workspaceId -> workspace.id, runtimeId -> agentRuntime.id, ownerId -> user.id

### agent_whitelist
- id: text (default, pk)
- agentId: text (required, fk)
- workspaceId: text (required, fk)
- email: text (required)

### channel
- id: text (default, pk)
- workspaceId: text (fk, required)
- name: text (required)
- position: integer (default, required)
- _relations_: workspaceId -> workspace.id

### conversation
- id: text (default, pk)
- workspaceId: text (fk, required)
- agentId: text (required, fk)
- userId: text (fk, required)
- title: text (default, required)
- type: text (default, required)
- channel: text (default, required)
- parentMessageId: text (fk)
- threadTitle: text (default, required)
- _relations_: workspaceId -> workspace.id, userId -> user.id

### message
- id: text (default, pk)
- conversationId: text (fk, required)
- role: text (required)
- content: text (default, required)
- taskId: text (fk)
- attachmentIds: text
- metadata: text
- status: text (default, required)
- _relations_: conversationId -> conversation.id

### agent_task_queue
- id: text (default, pk)
- agentId: text (required, fk)
- runtimeId: text (fk, required)
- workspaceId: text (fk, required)
- conversationId: text (fk, required)
- prompt: text (required)
- type: text (default, required)
- contextKey: text
- status: text (default, required)
- priority: integer (default, required)
- result: text
- context: text
- sessionId: text (fk)
- dispatchedAt: text
- startedAt: text
- completedAt: text
- error: text
- traceId: text (fk)
- parentTaskId: text (fk)
- commentStatus: text
- commentRetryQueuedAt: text
- _relations_: runtimeId -> agentRuntime.id, workspaceId -> workspace.id, conversationId -> conversation.id

### issue
- id: text (default, pk)
- workspaceId: text (fk, required)
- agentId: text (fk)
- creatorUserId: text (fk, required)
- conversationId: text (fk)
- latestTaskId: text (fk)
- title: text (required)
- description: text (default, required)
- status: text (default, required)
- completedAt: text
- _relations_: workspaceId -> workspace.id, creatorUserId -> user.id, conversationId -> conversation.id, latestTaskId -> agentTaskQueue.id

### issue_comment
- id: text (default, pk)
- issueId: text (fk, required)
- workspaceId: text (fk, required)
- authorType: text (default, required)
- authorId: text (required, fk)
- content: text (required)
- _relations_: issueId -> issue.id, workspaceId -> workspace.id

### task_message
- id: text (default, pk)
- taskId: text (fk, required)
- seq: integer (required)
- type: text (default, required)
- tool: text (default, required)
- content: text (default, required)
- callId: text (default, required, fk)
- input: text
- output: text (default, required)
- _relations_: taskId -> agentTaskQueue.id

### emails
- id: text (default, pk)
- agentId: text (required, fk)
- workspaceId: text (required, fk)
- fromEmail: text (required)
- toEmail: text (required)
- subject: text (default, required)
- r2Key: text (required)
- isWhitelisted: integer (default, required)
- forwarded: integer (default, required)
- messageId: text (default, required, fk)
- inReplyTo: text (default, required)
- references: text (default, required)
- htmlBody: text (default, required)
- attachments: text (default, required)
- status: text (default, required)
- direction: text (default, required)

### calendar_event
- id: text (default, pk)
- agentId: text (required, fk)
- workspaceId: text (required, fk)
- title: text (required)
- description: text
- scheduledAt: text (required)
- repeatInterval: text
- repeatStopAt: text
- lastTriggeredAt: text
- exceptions: text (default, required)

### artifact
- id: text (default, pk)
- conversationId: text (fk, required)
- agentId: text (required, fk)
- workspaceId: text (fk, required)
- filename: text (required)
- contentType: text (default, required)
- size: integer (required)
- r2Key: text (required)
- thumbnailR2Key: text
- source: text (default, required)
- _relations_: conversationId -> conversation.id, workspaceId -> workspace.id

### agent_email_account
- id: text (default, pk)
- agentId: text (required, fk)
- workspaceId: text (required, fk)
- emailAddress: text (required)
- displayName: text (default, required)
- imapHost: text (required)
- imapPort: integer (default, required)
- imapUsername: text (required)
- imapPassword: text (required)
- imapTls: integer (default, required)
- smtpHost: text (required)
- smtpPort: integer (default, required)
- smtpUsername: text (required)
- smtpPassword: text (required)
- smtpTls: integer (default, required)
- pollIntervalSeconds: integer (default, required)
- lastSyncedUid: text (default, required)
- lastSyncedAt: text
- status: text (default, required)
- errorMessage: text (default, required)

### meeting_session
- id: text (default, pk)
- agentId: text (required, fk)
- workspaceId: text (required, fk)
- title: text (default, required)
- meetingUrl: text (required)
- status: text (default, required)
- fromEmail: text
- isWhitelisted: integer (default, required)
- participants: text (default, required)
- scheduledAt: text
- startedAt: text
- completedAt: text
- transcriptR2Key: text
- summary: text
- error: text
- workerSessionId: text (fk)

### machine_token
- id: text (default, pk)
- userId: text (fk, required)
- workspaceId: text (fk)
- token: text (required, unique)
- name: text (default, required)
- status: text (default, required)
- hostname: text
- runtimesJson: text
- lastUsedAt: text
- _relations_: userId -> user.id, workspaceId -> workspace.id

### message_flag
- id: text (default, pk)
- messageId: text (fk, required)
- userId: text (fk, required)
- workspaceId: text (fk, required)
- _relations_: messageId -> message.id, userId -> user.id, workspaceId -> workspace.id

### conversation_map
- id: text (default, pk)
- key: text (required)
- workspaceId: text (fk, required)
- conversationId: text (fk, required)
- _relations_: workspaceId -> workspace.id, conversationId -> conversation.id

### agent_link
- id: text (default, pk)
- workspaceId: text (required, fk)
- sourceAgentId: text (required, fk)
- targetAgentId: text (required, fk)
- instruction: text (default, required)

### conversation_read_state
- id: text (default, pk)
- conversationId: text (fk, required)
- userId: text (fk, required)
- lastReadAt: text (default, required)
- _relations_: conversationId -> conversation.id, userId -> user.id

### workspace_file_request
- id: text (default, pk)
- workspaceId: text (fk, required)
- agentId: text (required, fk)
- requestType: text (required)
- path: text (default, required)
- status: text (default, required)
- result: text
- _relations_: workspaceId -> workspace.id

### agent_skill
- id: text (default, pk)
- workspaceId: text (fk, required)
- agentId: text (fk)
- daemonId: text (fk)
- runtime: text (required)
- name: text (required)
- description: text (default, required)
- syncedAt: text (default, required)
- _relations_: workspaceId -> workspace.id

### inbox_unread
- id: text (default, pk)
- conversationId: text (fk, required)
- userId: text (fk, required)
- workspaceId: text (required, fk)
- agentId: text (required, fk)
- taskId: text (required, fk)
- taskType: text (required)
- taskStatus: text (required)
- taskPrompt: text
- completedAt: text (required)
- latestMessageId: text (fk)
- _relations_: conversationId -> conversation.id, userId -> user.id
