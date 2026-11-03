# TokenLess

TokenLess is a small Windows app that sits next to Claude Code and looks over a prompt before you send it. You copy the prompt from your terminal, click Gear, and Haiku rewrites it so the model on the other end knows how long the answer should be and what shape it should take. It also cuts filler and flags anything vague. You compare the two versions side by side, change what you like, and paste the result back into your terminal.

I built it because Claude usually says more than I need, and the answer is where the tokens go. On Anthropic's pricing, output tokens cost about five times as much as input tokens. A line like "diff only, no preamble" costs about a dozen tokens and can save hundreds. TokenLess adds that kind of line to every prompt using the cheapest model, so the expensive one gets told exactly what I want back.

## Why not just ask Claude to shorten the prompt?

Shortening the question saves the least. Gearing goes after the answer first: how long it should be, what format, and no narration. A geared prompt can come back longer than what you typed and still be the cheaper one to send.

The rewrite runs on Haiku through the Anthropic API, outside your Claude Code session. It doesn't spend your working model's tokens and adds nothing to that session's context.

Haiku also reviews the prompt while it rewrites it. It flags open-ended scope ("while you're in there"), references it can't pin down, and rewrites that cut more than 80% of the text, so you can check what went. It is told never to invent file paths or function names you didn't give it.

You decide what gets sent. The rewrite is editable, Re-gear tries again, and Copy original is right there. The review also shows what the gear itself cost next to the estimated cost of the request, so you can see when gearing a one-line prompt isn't worth it.

## How you use it

TokenLess doesn't run Claude Code. Version 1 did, inside an embedded terminal, and it kept falling behind Claude Code's own features. Now you run Claude Code wherever you like (CLI, Desktop, your IDE) and TokenLess sits beside it. The layout is built for half a screen, about 720px wide, and the sidebar folds down to an icon strip.

1. Write your prompt in the terminal, select it and press Ctrl+C, then click Capture. TokenLess strips ANSI escape codes and a trailing shell prompt such as `$` or `PS>`. You can also type straight into the composer or start from a template.
2. Set the options under the prompt. Model is the model you'll send to (Haiku 4.5, Sonnet 4.6 or Opus 4.7) and drives the cost estimate. Breadth is how much answer you want: Terse (about 200 words), Normal or Thorough. Format is the response shape to ask for: Prose, Bullets, Code only or JSON. Skill optionally passes one of your Claude Code skills to the gearing call.
3. Click Gear. A drawer opens with the original and the geared prompt, token counts for each, any critique flags, and the expected cost on the model you picked.
4. Edit the geared text if you want, click Copy geared in the drawer, then paste into your terminal and press Enter.

## Other features

- Projects map to a folder on disk. Inside a project, conversations are named workspaces for drafts, and drafts save as you type, so a half-written prompt is still there after you close the app.
- Each account holds its own Anthropic API key, and you switch accounts from the top bar. That keeps personal and work billing apart.
- The skill picker finds skills in `~/.claude/skills`, in installed plugins and in the project's `.claude/skills`, and picks up changes while the app runs. You can star skills or hide them.
- Eight built-in templates cover common code work, such as writing tests, code review, debugging and commit messages.
- Settings holds your default model, breadth and format.
- Developer Mode shows the app's structured log as a sortable, filterable table. Error rows have an Analyze with AI button that asks Haiku what went wrong.

## Privacy

Prompts leave your machine only when you click Gear (or Analyze with AI), and they go to Anthropic's API. The database and logs live in `%APPDATA%\tokenless`, and TokenLess sends no telemetry anywhere. API keys are stored in plain text in that local database, so anything that backs up `%APPDATA%` will copy them.

## Requirements

- Windows, x64. There are no macOS or Linux builds yet.
- An Anthropic API key (it starts with `sk-ant-`) from console.anthropic.com. Gearing is billed per token to that key, separately from any Claude subscription.
- Claude Code, or anywhere else you type prompts to Claude. The clipboard works with all of them.
- To build from source: Node.js 20 or later and npm. The better-sqlite3 native module may need Visual Studio Build Tools if no prebuilt binary matches your setup.

## Install

Tagged releases attach a zipped Windows build (`TokenLess-<tag>-win-x64.zip`) to the GitHub Releases page. Unzip it and run `TokenLess.exe`. The app isn't code-signed, so SmartScreen will warn you the first time. On first launch you get a short privacy notice, then a setup wizard asks for your API key and a first project.

## Run from source

```
git clone https://github.com/Aiden-Molyneaux/tokenless.git
cd tokenless
npm install
npm run rebuild:electron
npm run dev
```

better-sqlite3 is compiled for one runtime at a time. `npm run rebuild:electron` builds it for Electron, which the app and the E2E tests need. `npm run rebuild:node` builds it for Node, which the unit and integration tests need.

To build a standalone copy, run `npm run rebuild:electron` and then `npm run build:unpack`. The app lands in `dist/win-unpacked/TokenLess.exe`.

## Tests

```
npm run rebuild:node
npm run typecheck
npm run test:run

npm run rebuild:electron
npm run build
npm run test:e2e
```

## License

MIT
