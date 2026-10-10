# 3Chat Customer Growth

[中文](README.md) · [English](README.en.md)

Run customer outreach across Instagram, Facebook Messenger, and WhatsApp from DeepSeek Harness. Review customer context, prepare personalized messages, and send through connected 3Chat channels after your confirmation. When customers reply, your configured 3Chat Agent can continue the conversation 24/7, answer questions, handle objections, and guide the next step or hand off to a person. Access and actions follow your organization’s 3Chat permissions.

## From customer insight to the next conversation

Suppose you want to reconnect with customers who recently made an inquiry:

1. **Find the audience:** describe the period and filters, then review customers and their recent conversation context.
2. **Prepare outreach:** ask DeepSeek Harness to summarize concerns and draft messages using the product information and campaign materials you supply.
3. **Confirm and send:** review recipients, sender account, channel, content, and attachments. For a batch, follow its progress and individual results.
4. **Continue the conversation:** when customers reply through a connected channel, its configured 3Chat Agent responds using your knowledge and business rules, with human handoff where needed.

You receive customer analysis you can act on, message drafts, and execution results. Assess purchases and bookings against your actual business records.

## How the parts work together

| Role | Responsibility |
|---|---|
| DeepSeek Harness | Interpret your goal, review context, analyze concerns, draft content, and orchestrate plugin tools. |
| This plugin | Connect DSH to 3Chat customer, conversation, group, attachment, and messaging capabilities, including authorization and tool calls. |
| 3Chat platform and Agent | Supply customer data and channel execution; an Agent configured in 3Chat handles incoming replies. |

**Prepare your 3Chat organization/workspace, channels, and Agent reply capabilities before connecting the plugin.** Plugin authorization and reply reception are separate setup steps. See the [usage guide](docs/usage.en.md).

## Try it in chat

> What new clients did I get yesterday?

> Draft a follow-up message for Ms. Lin.

> Send this event photo and introduction to Mr. Zhang.

These demonstrate discovery, drafting, and sending. Revise a draft before sending and confirm the recipient and final content. Choose between customers with the same name, and continue tracking a batch in the same conversation.

## Get started

Use official **DeepSeek Harness** and a **3Chat organization account** with customer access and channel sending permissions.

1. Prepare your workspace and connect channels at [3Chat Global](https://3chat.ai). For autonomous reception, configure the channel’s Agent, knowledge, and human handoff rules.
2. [Download the latest package](https://github.com/3ChatAI-NCT/3chatai-deepseek-harness-plugin/releases/latest/download/3chat-customer-growth.tgz) and keep the `.tgz` file. Open DSH **Plugins → Add plugin**, paste the downloaded file’s full path, then install and enable it.
3. Open “3Chat Customer Growth,” select “Connect 3Chat,” and authorize the intended organization account in your browser.
4. Return to chat. Start by finding a known customer and preparing a follow-up draft.

Use the prebuilt GitHub Release package; no compilation is needed. To upgrade, uninstall, download the new package, and install it. See the [development guide](docs/development.en.md) to build locally.

The DSH interface language selects the service: Chinese uses the domestic service; other languages use the global service. Each service requires its own authorization. Uploads and sends also require DSH approval for that execution. Customer and channel access follow your organization’s grant.

## Learn more

- [Usage guide](docs/usage.en.md): workspace and reply setup, a complete outreach example, and common connection or sending questions.
- [Development guide](docs/development.en.md): source builds, host compatibility, tool interfaces, and community listing preparation.

The plugin currently supports customer, conversation, and group discovery; context retrieval; attachments; individual and batch messaging; and batch status. Brand libraries, scheduled campaigns, ongoing follow-up task controls, and revenue attribution belong to the broader product roadmap. See the development guide for the current tool scope.

## Feedback and license

Report issues or suggestions through [Issues](https://github.com/3ChatAI-NCT/3chatai-deepseek-harness-plugin/issues), with reproduction steps, your DSH environment, and error messages stripped of customer information. Read the development guide before contributing code.

[Apache-2.0 license](LICENSE). Bundled dependency notices are included in the installation package.
