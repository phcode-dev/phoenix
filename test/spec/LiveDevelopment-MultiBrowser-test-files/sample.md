# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6 df

---

## Paragraphs and Inline Formatting

This is a regular paragraph with **bold text**, _italic text_, and **_bold italic text_**. You can also use
**underscores for bold** and _underscores for italic_.

Here is some ~strikethrough text~ and some `inline code` within a sentence.

This paragraph has a soft line break above (two trailing spaces).

## Links and Images

[Visit GitHub](https://github.com)

[Link with title](https://github.com "GitHub Homepage")

Autolinked URL: [https://example.com](https://example.com)

Email autolink: [user@example.com](mailto:user@example.com)

![Alt text for an image](https://via.placeholder.com/200x100 "Placeholder Image")

## Blockquotes

> This is a blockquote.
>
> It can span multiple paragraphs.//

> Nested blockquotes:
>
> > This is nested inside.
> >
> > > And this is even deeper.

## Lists

### Unordered List

- Item one
- Item two
    - Nested item A
    - Nested item B
        - Deeply nested item
        - Deeply nested item 2
- Item three

### Ordered List

1.  First item
2.  Second item
    1.  Sub-item one
    2.  Sub-item two
3.  Third item

### Mixed List

1.  Ordered item
    - Unordered child
    - Another child
2.  Another ordered item

### Task List (GFM)

- [x] Completed task
- [x] Another done task
- [ ] Incomplete task
- [ ] Another pending task

## Code Blocks

### JavaScript

```js
// Fibonacci sequence generator
function* fibonacci(limit) {
  let [a, b] = [0, 1];
  while (a <= limit) {
    yield a;
    [a, b] = [b, a + b];
  }
}

const results = [...fibonacci(100)];
console.log(results); // [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]

// Async fetch example
async function fetchUsers() {
  try {
    const response = await fetch("/api/users");
    const data = await response.json();
    return data.filter((user) => user.active);
  } catch (error) {
    console.error("Failed to fetch users:", error);
  }
}
```

### HTML

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sample Page</title>
    <style>
      .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
      }
      .card {
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <h1>Hello, World!</h1>
        <p>This is a <strong>sample</strong> HTML page.</p>
        <button onclick="alert('Clicked!')">Click Me</button>
      </div>
    </div>
  </body>
</html>
```

![pexels-pixabay-459225.jpg](https://user-cdn.phcode.site/images/c2cfcfa7-8279-4aab-bf13-ea712fabf677.jpeg)

![Screenshot from 2026-03-17 20-32-00.png](https://user-cdn.phcode.site/images/87e15e81-941a-4e4a-9144-7ee9fdf56897.jpeg)

## Tables (GFM)

| Feature        |   Status    | Priority |
| -------------- | :---------: | -------: |
| Dark mode      |    Done     |     High |
| Export to PDF  | In progress |   Medium |
| Mobile layout  |   Planned   |      low |
| Accessibility! |             |          |

### Minimal Table

| A   | B   | C   |
| --- | --- | --- |
| 1   | 2   | 3   |

## Horizontal Rules

Three different syntaxes:

---

---

---

## Footnotes (GFM)

Here is a sentence with a footnote\[^1\] and another one\[^note\].

\[^1\]: This is the first footnote. \[^note\]: This is a named footnote with more detail.

## Definition-style References

## Emoji (GFM shortcodes)

:rocket: :tada: :bug: :white_check_mark:

## Escape Characters

\*This is not italic\* and \`this is not code\`.

Backslash: \\, Backtick: \`, Asterisk: \*, Underscore: \_, Hash: #

## HTML in Markdown

Click to expand

This content is hidden by default. It supports **Markdown** inside.

- List item inside details
- Another item

Ctrl + C to copy.

Text with superscript and subscript.

Term 1

Definition for term 1

Term 2

Definition for term 2

## Alerts / Admonitions (GFM)

> \[!NOTE\] This is a note alert.

> \[!TIP\] This is a tip alert.

> \[!IMPORTANT\] This is an important alert.

> \[!WARNING\] This is a warning alert.

> \[!CAUTION\] This is a caution alert.

## Long Paragraph for Wrapping Test

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna
aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis
aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint
occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
