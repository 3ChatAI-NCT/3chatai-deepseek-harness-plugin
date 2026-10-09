# Typical Use Cases

These examples illustrate tool selection and decision boundaries. Always use the live tool `inputSchema`, preserve returned canonical IDs, and follow the confirmation, error, retry, and idempotency rules in this skill. Analysis, drafting, and audience selection never authorize sending.

## 1. Find and Brief a Customer Before a Sales Follow-up

Example request: "How has Ms. Lin been doing recently? Summarize her interests, buying stage, and main concerns."

1. Call `search_3chat_customers` with identifying information supplied by the user.
2. If one customer is resolved, retain the returned canonical `customer_id`. If multiple plausible customers remain and one customer must be analyzed, ask the user to choose.
3. Call `search_3chat_customers_context` for the selected customer. Request the conversation fields and messages needed for the analysis; request `agent_logs` only when the user needs AI-handling diagnostics.
4. Distinguish returned facts from inference. Cite the relevant time range and state when messages are truncated or unavailable.
5. Return a concise brief covering explicit needs, interests, stage evidence, concerns, unresolved questions, and suggested next steps. Do not send a message unless the user separately asks and confirms.

## 2. Review Recent Sales Conversations

Example request: "Find conversations from the last 30 days that were transferred to a human or remain unresolved, and summarize the common blockers."

1. Use `search_3chat_conversations` with the requested time range and supported status, transfer, solved, or reply-strategy filters.
2. Continue pagination when the user expects a complete result set.
3. Use returned `customer_id` or `group_id` values to retrieve detailed context only for the conversations that require transcript-level evidence.
4. Group observations by evidence-backed themes such as pricing, product fit, timing, implementation, or missing information.
5. Report the sample size, time range, exclusions, and incomplete context. Do not claim server-side aggregate analytics when the analysis was performed over retrieved records.

## 3. Build and Prepare a Customer Outreach List

Example request: "Find high-intent customers who asked about the product in the last 30 days but have not converted, and prepare a tailored re-engagement message."

1. Use `search_3chat_customers` in list mode with supported standard fields, tenant-defined custom fields, and latest-inquiry time filters.
2. Paginate until the requested audience is complete. Keep all valid matches; do not force a single-customer selection.
3. Retrieve customer context when intent, objections, or personalization must be verified from communication history.
4. Present the proposed recipient list, selection rationale, and draft message. Separate returned data from model-derived recommendations.
5. Stop before sending. Send only after the user confirms the exact recipients, sender account or channel, message, attachments, and batch scope.

## 4. Send a Confirmed Attachment Campaign

Example request: "Send this event image and introduction to the customers we just selected."

1. Preserve the previously selected canonical customer IDs and verify that the selection is still current.
2. If a final directly downloadable HTTP/HTTPS attachment URL is already available, use it. Otherwise call `upload_3chat_attachment` and reuse the complete returned `data.attachment` object.
3. Show the final recipients, sender account or channel, text, attachment, and batch scope immediately before sending.
4. After explicit confirmation, use `send_3chat_customer_message` for one customer or `send_3chat_customer_messages` for multiple customers. Apply the documented item limits and idempotency rules.
5. If a batch returns `job_id`, call `get_3chat_batch_send_status`; do not submit the batch again.

## 5. Batch Send Messages to Selected Customers

Example request: “Send an event invitation to customers who asked about the product in the last 30 days but have not converted.”

1. Use `search_3chat_customers` to find customers by supported standard fields, tenant-defined custom fields, and latest-inquiry time. Continue pagination when a complete audience is required.
2. Preserve the canonical `customer_id` values returned by the tool. Present the matched customers, filtering criteria, and audience size; do not force the user to select a single customer.
3. Draft the message using available customer information. When personalization requires communication history, call `search_3chat_customers_context` to review customer needs, interests, and concerns.
4. Before sending, show the final recipients, sender account or channel, message content for each customer, attachments, and batch scope. Obtain explicit user confirmation.
5. After confirmation, call `send_3chat_customer_messages`. Each `items[]` entry must contain the corresponding `customer_id`, message content, `confirmation_token`, and a unique `idempotency_key`.
6. A batch may contain up to 100 customers. To reduce channel-limit risk and simplify verification, prefer batches of 1 to 3 customers before continuing.
7. After the tool returns `job_id`, call `get_3chat_batch_send_status` for the original job. Do not submit the same batch again.
8. When the job reaches a terminal state, summarize successful and failed items using the counters and each `data.results[].success` value. Explain failures with their item-level structured error fields. Do not automatically resend failed items.
9. `accepted`, `sent`, and `COMPLETED` represent processing states only; they do not prove channel delivery or that a customer has read the message.

## 6. Track a Batch Send

Example request: "Check whether the batch we just sent has finished and tell me which recipients failed."

1. Call `get_3chat_batch_send_status` with the original `job_id`.
2. Poll the same job while it is `QUEUED` or `RUNNING`, using the documented backoff and runtime limits.
3. At a terminal state, summarize totals and inspect each `data.results[].success` value.
4. Explain item failures using their structured error fields. Do not automatically resend failed or ambiguous items.
5. Never describe `accepted`, `sent`, or `COMPLETED` as confirmed channel delivery or customer read status.
