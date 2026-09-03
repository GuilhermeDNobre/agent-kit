import { test } from "node:test";
import assert from "node:assert/strict";
import { render, findUnresolved, findModes } from "../src/render.js";

const TEMPLATE = [
  "# {{PROJECT_NAME}}",
  "<!--IF:greenfield-->",
  "stack not chosen",
  "<!--END-->",
  "<!--IF:existing-->",
  "stack is {{STACK_MANIFEST}}",
  "<!--END-->",
  "tail",
].join("\n");

test("keeps only the block matching the selected mode", () => {
  const output = render(TEMPLATE, "greenfield", { PROJECT_NAME: "demo" });
  assert.match(output, /stack not chosen/);
  assert.doesNotMatch(output, /stack is/);
});

test("selects the existing block and fills its placeholder", () => {
  const output = render(TEMPLATE, "existing", {
    PROJECT_NAME: "demo",
    STACK_MANIFEST: "package.json",
  });
  assert.match(output, /stack is package\.json/);
  assert.doesNotMatch(output, /stack not chosen/);
});

test("drops every block when the mode matches none", () => {
  const output = render(TEMPLATE, "other", { PROJECT_NAME: "demo" });
  assert.doesNotMatch(output, /stack not chosen/);
  assert.doesNotMatch(output, /stack is/);
  assert.match(output, /tail/);
});

test("never leaves conditional markers in the output", () => {
  const output = render(TEMPLATE, "greenfield", { PROJECT_NAME: "demo" });
  assert.doesNotMatch(output, /<!--IF:/);
  assert.doesNotMatch(output, /<!--END-->/);
});

test("substitutes known placeholders and leaves unknown ones untouched", () => {
  const output = render("{{KNOWN}} {{MISSING}}", "any", { KNOWN: "yes" });
  assert.equal(output, "yes {{MISSING}}");
});

test("findUnresolved reports remaining placeholders without duplicates", () => {
  assert.deepEqual(findUnresolved("{{A}} {{B}} {{A}}"), ["A", "B"]);
  assert.deepEqual(findUnresolved("nothing here"), []);
});

test("findModes lists the modes a template declares", () => {
  assert.deepEqual(findModes(TEMPLATE), ["greenfield", "existing"]);
});

test("an empty replacement value still replaces the placeholder", () => {
  assert.equal(render("[{{EMPTY}}]", "any", { EMPTY: "" }), "[]");
});

test("leaves JSX double braces alone", () => {
  const jsx = "<Ctx.Provider value={{ user, login, logout }}>";
  assert.equal(render(jsx, "any", { USER: "x" }), jsx);
  assert.deepEqual(findUnresolved(jsx), []);
});

test("does not treat lowercase or mixed-case braces as placeholders", () => {
  assert.equal(render("{{name}} {{Name}}", "any", { name: "a", Name: "b" }), "{{name}} {{Name}}");
});
