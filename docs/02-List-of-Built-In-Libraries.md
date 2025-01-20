

# Built-in Libraries

This document lists the standard libraries that are pre-integrated into @codebase and available for use in your extensions and projects.

## Icon Libraries

### Font Awesome
Font Awesome provides scalable vector icons that can be customized with CSS.

**Import:**
Font Awesome is globally available

```js
// Add a Font Awesome icon to an element
element.innerHTML = '<i class="fas fa-save"></i>';
```


### Devicons
Developer-focused icons for programming languages and development tools.

**Import:**
Devicons are available globally.

```js
// Add a Devicon to an element
element.innerHTML = '<i class="devicon-javascript-plain"></i>';
```


### Octicons
GitHub's icon set.

**Import:**
Octicons are available globally.

```js
// Add an Octicon to an element
element.innerHTML = '<i class="octicon octicon-mark-github"></i>';
```

## Template Engines

### Mustache
Logic-less templates.

**Import:**
Mustache is available globally.

```js
const Mustache = brackets.getModule("thirdparty/mustache/mustache");
// example
const template = "Hello {{name}}!";
const data = { name: "World" };
const output = Mustache.render(template, data);
```


## Utility Libraries

### Lodash
A modern JavaScript utility library delivering modularity, performance & extras.

**Import:**
Lodash is available globally.

```js
const _ = brackets.getModule("thirdparty/lodash");
```


### Marked
A markdown parser and compiler.

**Import:**
Marked is available globally.

```js
const marked = brackets.getModule('thirdparty/marked.min');
const html = marked("# I am using __markdown__.");
```


## Phoenix-specific Libraries

These libraries are available through the Phoenix.libs namespace:

### LRU Cache
Least Recently Used (LRU) cache implementation.

**Import:**
```js
const { LRUCache } = Phoenix.libs;
// example
const cache = new LRUCache(100); // Create cache with max 100 items
cache.set('key', 'value');
const value = cache.get('key');
```


### Highlight.js
Syntax highlighting for code.

**Import:**

```js
const { hljs } = Phoenix.libs;
// see hilight js docs for usage
```


### iconv
Character encoding conversion.

**Import:**
```js
const { iconv } = Phoenix.libs;
// Example
const buffer = iconv.encode("Hello", 'utf8');
const text = iconv.decode(buffer, 'utf8');
```

### picomatch
Glob matching and pattern matching.

**Import:**
```js
const { picomatch } = Phoenix.libs;
// Example
const isMatch = picomatch('.js');
console.log(isMatch('file.js')); // true
console.log(isMatch('file.css')); // false
```



## Notes

- All libraries are pre-loaded when your extension starts up
- Some libraries are available globally through the `window` object
- Phoenix-specific libraries are accessed through `Phoenix.libs`
- Version information for each library can be found in the package dependencies
