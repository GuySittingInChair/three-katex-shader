---
summary: Using a local AI to find where a page loses a beginner, then having the fix checked.
added: 2026-11-19
---

# Getting a second opinion on an explanation

**In one sentence:** when a page (or something Claude told you) doesn't make sense, you can have a
beginner AI on your own computer point out exactly where it loses people, have Claude fix that, and then
have a different AI check the fix.

**Picture it:** a school essay with three readers. A classmate reads it first and scribbles "huh?" in
the margins. The writer rewrites those bits. Then a teacher who has never seen it reads the old and new
versions side by side and says whether the "huh?"s are gone.

- The **classmate** is a small AI running on your own computer (through Ollama). It pretends to be a
  curious adult with no programming, maths or physics background, and it's told not to fake
  understanding.
- The **writer** is Claude.
- The **teacher** is any other AI you like (ChatGPT, Gemini, a fresh Claude chat), or the AI on your own
  computer playing a strict editor.

**Why it helps:** Claude wrote the page, so Claude is the worst judge of whether it's clear. Someone who
already understands a thing can't easily see the gap a beginner falls into. A separate reader can.

**How to do it:** type these in a terminal (the window where you type commands, Konsole).

1. `wikicritic sketches/kuramotoSivashinsky-fix`
   The classmate reads the page carefully, thinking before it answers (about 5 minutes). Then, for a
   walkthrough, a second pass compares the page with the sketch's real code and lists anything that
   looks wrong (a few more minutes). It prints a message for Claude: a clarity score out of
   10, what it *thinks* the page says (if that's wrong, the page misleads), the sentences that lost it,
   and its questions. The message is put on your clipboard.
2. Paste that message to Claude. Claude rewrites the page and says what it changed for each question.
3. `wikicritic review sketches/kuramotoSivashinsky-fix`
   This puts a review request on your clipboard: the old page, the questions and the new page. Paste it
   into another AI, then paste its answer back to Claude.
   Add `--local` to the end to also have the AI on your computer do the review, this time playing a
   strict editor (a few minutes). It saves its verdict as a message for Claude too.

To check every page at once, type `wikicritic all`. The classmate reads all of them, one after another
(about 8 to 12 hours, so leave it running overnight; it pauses while fake chat is live, and skips pages it has already read that
haven't changed). It keeps a list, least clear first, in `tools/wiki-review/out/ALL.md`. Then tell
Claude "fix the wiki".

To check something Claude said in the chat instead of a page: copy Claude's reply, then type
`wikicritic paste`.

The page name is the part after `/wiki/` in the site's address, so
`aiship.lol/wiki/sketches/boidsFlock` is `sketches/boidsFlock`, and `aiship.lol/wiki/shaders` is
`shaders`.

**What to watch for:**
- The classmate is small, so it sometimes complains about a word the page *did* explain. That's still
  useful: it means the explanation was easy to miss. Claude is asked to fix the sentence, not argue.
- It's told to quote the page word for word. Complaints that quote words that aren't there are thrown
  away automatically, and the tool tells you how many.
- It won't run while your fake chat is live, so it doesn't steal the graphics card mid-stream.
- Everything it writes is kept in `tools/wiki-review/out/` in the project (not on the website).

**Where it lives:** `tools/wiki-review/review.mjs`. The beginner it plays is described here:

```js
const READER = `You are Sam: a curious, intelligent adult with NO programming, maths or physics background.
```

**Related:** the **💬 This is unclear** button on every wiki page (see [the wiki home](README.md)), for
when you'd rather say it in your own words.
