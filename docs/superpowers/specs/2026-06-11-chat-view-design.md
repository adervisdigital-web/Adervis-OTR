# ADERVIS OTR v2 — Chat-First Outreach Tool

**Date:** 2026-06-11
**Status:** Approved
**Scope:** Chat view redesign, AI suggestion panel, onboarding wizard

## Context

ADERVIS OTR is a personal outreach tool (not a CRM) for a video production manager.
Single-file HTML app: Adervis LidGen.html. Vanilla JS, localStorage, no build step.

## Goals

1. Replace the script modal with a full-screen chat view (Telegram-style UX)
2. Add AI suggestion panel: script templates + Gemini-generated reply as cards
3. Add onboarding wizard for first-time users (CTA setup + first lead)
4. Keep all existing functionality (table, filters, bulk import, export, settings)

## Architecture

Two views that swap in place of the main content area:

- table-view (default): Dashboard + filters + lead table
- chat-view (on dialog click): Full-screen chat for selected lead

showView(name, leadId) toggles display on two top-level div containers.
No routing library. No frameworks added.

## Table View

Preserved as-is. Only change: "Dialog" button calls openChatView(leadId)
instead of openScriptModal(leadId). The #scriptModal is removed from DOM.

## Chat View Layout

chat-header: Back button | Lead name | Status dropdown | Platform link
chat-feed: Message bubbles (client left, manager right) with timestamps
client-input: Text field + Add button (Enter to submit)
suggestion-panel: Template cards + AI button + draft textarea + Send button
notes: Textarea for lead notes

## Chat Header

- Back button: returns to table-view, preserves filters
- Lead name: read-only display
- Status dropdown: inline status change (0-4), no page reload
- Platform link: VK/Inst/TG icon + clickable href (opens in new tab)

## Chat Feed

- Client bubbles: left-aligned, dark background
- Manager bubbles: right-aligned, purple tint
- Timestamp + label under each bubble
- Auto-scroll to bottom on new message
- Empty state: "No messages. Add client reply below."

## Client Input

- Field + Add button. Enter (no Shift) = add.
- After submit: field clears, message appears, suggestion panel refreshes.

## Suggestion Panel

Always visible (not only after new client message).
Shows templates for current funnel stage + AI button.

Templates: up to 3 cards from scripts[lead.status].options, filtered by platform.
Click card: inserts CTA-substituted text into draft-area.

AI button: calls generateAiReply(). Result inserted into draft-area.

Draft area: editable textarea with pre-filled text.
"Save as Sent" button: adds message to lead.messages (fromClient: false),
saves to localStorage, clears draft.

## Onboarding Wizard

Trigger: on page load if localStorage key adervis_onboarded_v1 is absent.
Modal overlay, 3 steps, progress bar.

Step 1 - CTA: fields for callLink + briefLink. Hint about placeholders.
Step 2 - First lead: tabs "One lead" (name+link form) | "List of links" (textarea).
Step 3 - Start: 3-line how-it-works summary. "Let's go!" button sets flag and closes.

Skip button on each step skips all remaining steps and sets the flag.

## Data Model

Lead structure unchanged. messages[] already exists.
New localStorage key: adervis_onboarded_v1 (value: '1' when wizard shown).
currentDraft is runtime-only state, not persisted to localStorage.

## What Is NOT Changing

- Table logic, filters, sorting, bulk actions
- Script structure and template editor
- Backup/import/export (CSV + JSON)
- CSS variables and Linear.app design tokens
- Utility functions: escapeHtml, safeParseJSON, normalizeUrl, getPlatformBadge, uid
- Existing generateAiReply() reused as-is

## Implementation Notes

- Everything stays in one HTML file
- openChatView(leadId): hides #table-view, shows #chat-view, calls renderChatView(lead)
- renderChatView(lead): renders full chat-view content from current lead state
- #scriptModal removed from HTML entirely
- Dialog button in table calls openChatView instead of openScriptModal
