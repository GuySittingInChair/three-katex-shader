---
summary: A tongue-twister squeezed two ways: a Huffman code tree that gives common letters short codes, and LZ77's "go back, copy".
added: 2026-11-20
---

# She Sells Sea Shells, Compressed: in plain English

File: `src/sketches/huffmanSeaShells.js` · Mode: 3d (drawn on the [2D stage](../stage-2d.md)) · Category:
Algorithms

**What you see:** for the first 22 seconds, a tree assembling itself from gold letter-balls (each labelled
with how often it appears, like "s ×8") joined pairwise under blue branch-balls, with a 0 or 1 on every
branch. When it is complete, each letter shows its code underneath. Then the sentence "she sells sea shells by
the sea shore" lights up letter by letter while a stream of 0s and 1s grows beneath it. For the next 16
seconds, the same sentence on one line: gold arcs jump back from later parts of it to earlier parts, and a
list of letters and (back, copy) pairs grows underneath.

**The idea behind it:** computers store text as numbers: plain text uses 8 bits (eight 0s and 1s) for every
letter. But in most text some letters are far commoner than others, and that waste can be squeezed out.

**Huffman coding** (David Huffman, 1952, as a student, to avoid an exam): count each letter; then, again and
again, join the two rarest groups under a new branch, until one tree holds them all. Each letter's code is its
route from the top: 0 for a left turn, 1 for a right. Common letters end up near the top with short codes;
rare ones deep down with long ones. No code is the start of another, so a stream of bits can be read back
without gaps between codes.

How good can a letter-by-letter code be? Claude Shannon (1948) proved the limit: the *entropy*, H = −Σ p log₂
p bits per letter, where p is each letter's share. Huffman's code always comes within one bit of it, usually
much closer.

**LZ77** (Abraham Lempel and Jacob Ziv, 1977), the idea inside zip files and PNG images, works differently:
when a chunk of three or more letters has appeared before, write "go back d letters, copy n" instead of the
letters.

**Where the data comes from:** one tongue-twister.

**How it's built:**
- **Huffman:** count the 11 different characters; repeatedly sort and join the two lightest; read off each
  code by walking the tree. Ties are broken by creation order, so it's always the same tree.
- **LZ77, greedy:** at each point, look back over everything so far for the longest match of 3 or more
  letters; if there is one, write (back, copy) and jump past it; otherwise write the letter.

## The equation

- **H = −Σ p log₂ p**: 3.01 bits a letter for this sentence.
- **Huffman**: 3.08 bits a letter, 114 bits in all.
- **Plain text**: 8 bits a letter, 296 bits.
- In the second act: 37 letters become 23 tokens.

## A tour of the file

Building the tree, in `HUFF`:

```js
const l = queue.shift(), r = queue.shift(), n = { w: l.w + r.w, l, r, id: id++ };
```

Take the two lightest groups off the front of the sorted queue and make a new branch weighing their total.

Each letter's code:

```js
walk(n.l, path + '0', depth + 1); walk(n.r, path + '1', depth + 1);
```

Going left adds a 0, going right a 1; at a letter, the path so far is its code.

## Numbers worth knowing

Worked out in Node for "she sells sea shells by the sea shore":

- **37** letters (counting spaces), **11** different ones. "s" appears 8 times, "e" and the space 7 each.
- **Codes:** s = 01, e = 110, space = 111, h = 001, l = 100, … b = 10100.
- **114 bits** with Huffman against 296 as plain text: 39% of the size. The entropy limit is 3.01 × 37 = 111
  bits.
- **LZ77's copies:** " se" (back 6), "she" (back 14), "lls " (back 11), "he se" (back 24) and "a sh" (back
  18). None of them is the word "sea": the copies don't care about words.

**Try this (funky):** in `huffmanSeaShells.js`, change `const TEXT = 'she sells sea shells by the sea shore';`
to `const TEXT = 'abracadabra';`. Five different letters, and "a" is nearly half of them, so it gets a one-bit
code (0) and the rest three bits each: 23 bits in all, against 88 for plain text and an entropy limit of 22.4.
LZ77 turns the 11 letters into 8 tokens. (Worked out with the sketch's own code.)

**Words on this page:** [Huffman coding](../glossary.md#huffman-coding), [entropy](../glossary.md#entropy),
[bit](../glossary.md#bit), [LZ77](../glossary.md#lz77), [compression](../glossary.md#compression)
