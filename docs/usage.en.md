# Usage guide

[中文](usage.md) · [English](usage.en.md) · [Back to product guide](../README.en.md)

You provide a customer growth goal and business materials. DeepSeek Harness uses 3Chat context to analyze customers and prepare outreach; 3Chat executes confirmed sends, and your configured Agent receives replies. You choose recipients, approve final content, and make business decisions that need human judgment.

## Prepare your 3Chat workspace and reply capabilities

Complete business setup at [3Chat Global](https://3chat.ai) before authorizing the plugin in DSH. The steps below describe what to configure; exact controls depend on your 3Chat account and channel interface.

1. **Choose the organization/workspace.** Use the workspace that holds the intended customers. Check that your account can read customer and conversation records and send through the intended channels. Use an existing workspace where available; your administrator manages workspaces and permissions.
2. **Connect outreach and reception channels.** Check that the channel accounts are connected in that workspace, customers and conversations are visible, and you know which account should send.
3. **Prepare Agent knowledge and business rules.** Configure product information, FAQs, response style, and situations that need human attention, such as discount authority or complaints. Specify who takes over. For autonomous reception, enable the relevant reply capabilities for the Agent serving that channel.
4. **Check reply reception.** With an approved test customer, check that incoming messages reach the intended Agent, answers match your materials, and human handoff works when needed.

Complete these settings in **3Chat**. The DSH plugin connects existing capabilities; its current tools do not create workspaces, connect channels, or configure Agents. For discovery and drafting, begin with the first two steps. Complete the remaining steps before relying on Agent reception.

## Connect in DeepSeek Harness

Add and enable a prebuilt `.tgz` through the DSH plugin manager. Open the plugin panel, select “Connect 3Chat,” and authorize the intended organization account in your browser. If you need an archive, follow the [development guide](development.en.md) to build one.

After authorization, return to the panel. Use “Check connection” to check service availability, then find a known customer in chat. The connection state describes MCP access; reply capabilities depend on your Agent configuration in 3Chat.

Chinese selects the domestic service; other interface languages select the global service. Changing the DSH language switches connectors, and each requires a separate grant. Confirm customers and sender accounts in the currently selected service. You do not need to paste access tokens into chat.

## Complete one round of outreach

Use the same DSH conversation so customer selections, drafts, and execution results remain in context.

**Step 1: Find customers and understand their concerns.**

> Find customers who inquired within the last 30 days and have had no conversation in the last 7 days. Show their main concerns and the supporting context. Do not send anything yet.

The assistant searches using fields supported by the current service and reads relevant context. Intent and objection analysis are interpretations of those records. Adjust the period, audience, or exclusions as needed; available filters follow the service’s live interface.

**Step 2: Draft using your business materials.**

> Draft a follow-up for each selected customer using the event information I supplied. Address their individual concerns and show me the drafts first.

Provide product information, offer conditions, and usable images to DSH. DeepSeek Harness generates the content; the plugin supplies customer context and subsequent upload and sending capabilities. You supply campaign materials and brand requirements.

**Step 3: Review and confirm the send.**

> Use the audience and drafts we reviewed. Show each recipient, sender account, channel, message, and attachment, then wait for my confirmation before sending.

Confirm the preview explicitly. Uploads and sends also trigger DSH approval for that execution. Select the intended customer when names are ambiguous. Attachments use an accessible final download URL or the plugin’s upload capability.

**Step 4: Track execution and receive replies.**

> Check the progress of that batch and tell me which items were processed and which need attention.

The assistant checks the original batch’s individual results. Processing completion does not establish that customers read the message or made a purchase. When customers reply, the channel’s configured 3Chat Agent continues using existing knowledge and rules, with your team taking over where needed.

## Common questions

| Situation | Next step |
|---|---|
| Connected, but customers are missing | Check the service selected by your language, workspace permissions, and filters. Start with a known customer. |
| Search works, but sending fails | Check the channel, sender account, grant, and returned error. Follow the service’s suggested action. |
| The Agent does not answer replies | Check the incoming channel, Agent reception setup, and reply capabilities in 3Chat. Reauthorizing the plugin does not replace that setup. |
| Sign-in is required again | Reconnect in the panel and complete browser authorization. |
| You want to disconnect | Disconnecting removes this device’s credentials. Revoke the organization-side grant separately in 3Chat if needed. |

WhatsApp template sending requires the customer’s YCloud-linked account and an approved template. See the [tool interface guide](development.en.md) for details, host compatibility, and source builds.
