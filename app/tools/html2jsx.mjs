// Convert a design file's markup to JSX (a starting point for the React port).
//   node tools/html2jsx.mjs ../designs/Main.html > /tmp/out.jsx
// style="a: b; c: d" -> style={{ a: 'b', c: 'd' }}, kebab SVG attrs -> camelCase,
// {{x}} placeholders -> {v.x}, sc-for -> {list.map(...)} skeleton.
import { readFileSync } from "node:fs";

const src = readFileSync(process.argv[2], "utf8");
let body = src.slice(src.indexOf("</helmet>") + 9, src.lastIndexOf("</x-dc>"));

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const styleObj = (css) => {
  if (/^\{\{.*\}\}$/.test(css.trim())) return `{v.${css.trim().slice(2, -2)}}`;
  const parts = css.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(":");
    const k = d.slice(0, i).trim();
    const val = d.slice(i + 1).trim().replace(/'/g, "\\'");
    const key = k.startsWith("--") ? `'${k}'` : camel(k);
    return `${key}: '${val}'`;
  });
  return `{{ ${parts.join(", ")} }}`;
};

body = body
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/ style="([^"]*)"/g, (_, css) => ` style=${styleObj(css)}`)
  .replace(/ class="/g, ' className="')
  .replace(/ onClick="\{\{(\w+)\}\}"/g, " onClick={v.$1}")
  .replace(/ ([a-z]+(?:-[a-z]+)+)=/g, (m, a) => (a.startsWith("aria-") || a.startsWith("data-") ? m : ` ${camel(a)}=`))
  .replace(/<sc-for list="\{\{([\w.]+)\}\}" as="(\w+)"[^>]*>/g, "{v.$1.map(($2, i) => (")
  .replace(/<\/sc-for>/g, "))}")
  .replace(/\{\{([\w.]+)\}\}/g, "{$1}")
  .replace(/<(circle|rect|line|path|polyline|stop|mpath|input|br)([^>]*?)><\/\1>/g, "<$1$2 />");
process.stdout.write(body);
