"use client"

import { useMemo } from "react"

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
])

const DROP_CONTENT_TAGS = new Set([
  "applet",
  "audio",
  "base",
  "canvas",
  "embed",
  "form",
  "frame",
  "frameset",
  "iframe",
  "input",
  "link",
  "math",
  "meta",
  "noscript",
  "object",
  "script",
  "select",
  "source",
  "style",
  "svg",
  "template",
  "textarea",
  "track",
  "video",
])

const GLOBAL_ATTRIBUTES = new Set([
  "align",
  "bgcolor",
  "class",
  "colspan",
  "height",
  "rowspan",
  "style",
  "title",
  "valign",
  "width",
])

function sanitizeStyle(value: string) {
  return value
    .replace(/url\s*\([^)]*\)/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/@import/gi, "")
    .replace(/-moz-binding/gi, "")
    .replace(/behavior\s*:/gi, "")
    .trim()
}

function sanitizeHref(value: string) {
  const trimmed = value.trim()
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) {
    return trimmed
  }
  return null
}

function sanitizeImageSrc(value: string) {
  const trimmed = value.trim()
  if (/^data:image\//i.test(trimmed)) {
    return trimmed
  }
  return null
}

function sanitizeNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent ?? "")
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null
  }

  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()

  if (DROP_CONTENT_TAGS.has(tag)) {
    return null
  }

  if (!ALLOWED_TAGS.has(tag)) {
    const fragment = doc.createDocumentFragment()
    for (const child of Array.from(element.childNodes)) {
      const sanitizedChild = sanitizeNode(child, doc)
      if (sanitizedChild) {
        fragment.appendChild(sanitizedChild)
      }
    }
    return fragment
  }

  const clean = doc.createElement(tag)

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase()
    if (name.startsWith("on")) {
      continue
    }

    if (tag === "a" && name === "href") {
      const href = sanitizeHref(attribute.value)
      if (href) {
        clean.setAttribute("href", href)
        clean.setAttribute("rel", "noreferrer noopener nofollow")
        clean.setAttribute("target", "_blank")
      }
      continue
    }

    if (tag === "img" && name === "src") {
      const src = sanitizeImageSrc(attribute.value)
      if (src) {
        clean.setAttribute("src", src)
      }
      continue
    }

    if (!GLOBAL_ATTRIBUTES.has(name)) {
      continue
    }

    if (name === "style") {
      const style = sanitizeStyle(attribute.value)
      if (style) {
        clean.setAttribute("style", style)
      }
      continue
    }

    clean.setAttribute(name, attribute.value)
  }

  for (const child of Array.from(element.childNodes)) {
    const sanitizedChild = sanitizeNode(child, doc)
    if (sanitizedChild) {
      clean.appendChild(sanitizedChild)
    }
  }

  return clean
}

function buildSandboxedDocument(html: string) {
  const parser = new DOMParser()
  const parsed = parser.parseFromString(html, "text/html")
  const cleanDoc = document.implementation.createHTMLDocument("")
  const container = cleanDoc.createElement("div")

  for (const child of Array.from(parsed.body.childNodes)) {
    const sanitizedChild = sanitizeNode(child, cleanDoc)
    if (sanitizedChild) {
      container.appendChild(sanitizedChild)
    }
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"
    />
    <style>
      :root {
        color-scheme: light only;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #111827;
        font: 15px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      body {
        padding: 20px;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      img {
        max-width: 100%;
        height: auto;
      }
      pre {
        white-space: pre-wrap;
      }
      table {
        max-width: 100%;
        border-collapse: collapse;
      }
      a {
        color: #2563eb;
      }
    </style>
  </head>
  <body>${container.innerHTML}</body>
</html>`
}

type SafeEmailBodyProps = {
  body: string
  format: "html" | "text"
}

export function SafeEmailBody({ body, format }: SafeEmailBodyProps) {
  const srcDoc = useMemo(() => {
    if (format !== "html" || !body) {
      return null
    }
    return buildSandboxedDocument(body)
  }, [body, format])

  if (format !== "html") {
    return (
      <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">
        {body}
      </div>
    )
  }

  return (
    <iframe
      title="Email content"
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={srcDoc ?? ""}
      className="h-[70vh] w-full rounded-xl border border-border bg-white"
    />
  )
}
