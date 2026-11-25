import json
import re

from backend.agent.local_model import generate_local
from backend.actions.browser_control import browser_control, _bt, _ensure_started


FORM_EXTRACT_JS = """
() => {
  const results = [];
  const forms = document.forms.length ? Array.from(document.forms) : [document];
  for (const container of forms) {
    const fields = [];
    const items = container.tagName === 'FORM'
      ? Array.from(container.elements)
      : Array.from(container.querySelectorAll('input, select, textarea'));
    for (const el of items) {
      const t = (el.tagName + ' ' + (el.type || '')).toLowerCase().trim();
      if (!['input text','input email','input password','input search','input url',
            'input tel','input number','input date','input datetime-local',
            'input time','input month','input week','input color','input checkbox',
            'input radio','input file','textarea','select'].includes(t)) continue;
      if (el.type === 'hidden' || el.disabled) continue;
      const label = (() => {
        if (el.labels && el.labels.length) return el.labels[0].textContent.trim();
        const byFor = container.querySelector(`label[for="${el.id}"]`);
        if (byFor) return byFor.textContent.trim();
        const parent = el.closest('label');
        if (parent) return parent.textContent.trim();
        const aria = el.getAttribute('aria-label');
        if (aria) return aria.trim();
        return '';
      })();
      fields.push({
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
        name: el.name || '',
        id: el.id || '',
        placeholder: el.placeholder || '',
        label: label,
        required: el.required || false,
        value: el.value || '',
        options: el.tagName === 'SELECT' ? Array.from(el.options).map(o => ({text: o.text, value: o.value})) : [],
      });
    }
    if (fields.length) results.push({fields});
  }
  return results;
}
"""


def _run_js(js: str) -> str:
    _ensure_started()
    return _bt.run(_bt._page.evaluate(js))


def discover(url: str = None) -> list[dict]:
    """Navigate to a URL and discover all form fields on the page."""
    if url:
        browser_control({"action": "go_to", "url": url})
    raw = _run_js(FORM_EXTRACT_JS)
    return raw if isinstance(raw, list) else []


def fill_from_intent(url: str, intent: str, context: str = "") -> str:
    """
    Navigate to a URL containing a form, use LLM to understand the form
    fields and user intent, then fill and submit.

    Args:
        url: Page URL with the form
        intent: What the user wants to do (e.g. "sign up for newsletter with my email")
        context: Optional user context (e.g. saved name, email, etc.)
    """
    forms = discover(url)
    if not forms:
        return "No form fields found on the page."

    form_json = json.dumps(forms, indent=2)

    prompt = (
        f"User intent: {intent}\n"
        f"User context: {context or 'Not provided'}\n\n"
        f"Form fields detected on the page:\n{form_json}\n\n"
        "For each field, decide what value to enter. Return a JSON array of objects "
        "with keys 'selector' (CSS selector like '#id' or '[name=\"x\"]' or "
        "'input[type=\"email\"]'), 'value' (the text/value to fill), "
        "and optionally 'action' set to 'select' for dropdowns, 'check' for checkboxes, "
        "'click' for radio buttons, or 'submit' for the final submission button. "
        "Use the field's id, name, or a unique attribute combination as the selector. "
        "If you need a value the user hasn't provided, use reasonable placeholder data. "
        "Always include a submit step at the end using a button/link selector. "
        "Return ONLY valid JSON, no other text."
    )

    try:
        raw = generate_local(prompt, response_format="json")
    except Exception as e:
        return f"LLM failed to plan form filling: {e}"

    try:
        steps = json.loads(raw)
        if isinstance(steps, dict) and "steps" in steps:
            steps = steps["steps"]
        elif isinstance(steps, dict) and not isinstance(steps, list):
            steps = [steps]
    except json.JSONDecodeError:
        return f"LLM returned invalid JSON: {raw[:200]}"

    results = []
    for step in steps:
        selector = step.get("selector", "")
        value = step.get("value", "")
        action = step.get("action", "type")

        if action == "submit":
            try:
                r = browser_control({"action": "click", "selector": selector})
                results.append(f"Submitted: {r}")
            except Exception as e:
                results.append(f"Submit failed: {e}")
            break

        try:
            if action == "select":
                r = _bt.run(_bt._page.select_option(selector, value))
                results.append(f"✓ {selector} = {value}")
            elif action == "check":
                r = _bt.run(_bt._page.locator(selector).first.check())
                results.append(f"✓ {selector} checked")
            elif action == "click":
                r = _bt.run(_bt._page.locator(selector).first.click())
                results.append(f"✓ {selector} clicked")
            else:
                r = browser_control({
                    "action": "type",
                    "selector": selector,
                    "text": str(value),
                })
                results.append(f"✓ {selector} = {value}")
        except Exception as e:
            results.append(f"✗ {selector}: {e}")

    return "\n".join(results)


def fill_known(url: str, fields: dict[str, str], submit_selector: str = None) -> str:
    """
    Fill a form with known field→value mappings.
    fields: {label_text_or_name: value}
    """
    forms = discover(url)
    if not forms:
        return "No form fields found."

    field_map = {}
    for group in forms:
        for f in group.get("fields", []):
            key = (f["label"] or f["placeholder"] or f["name"] or f["id"]).lower().strip()
            field_map[key] = f

    results = []
    for label_text, value in fields.items():
        lt = label_text.lower().strip()
        matches = []
        for key, f in field_map.items():
            if lt in key or key in lt:
                matches.append(f)
        if not matches:
            matches = list(field_map.values())

        target = matches[0] if matches else None
        if not target:
            results.append(f"✗ No field found for: {label_text}")
            continue

        sel = f"#{target['id']}" if target['id'] else f"[name=\"{target['name']}\"]"
        try:
            browser_control({"action": "type", "selector": sel, "text": str(value)})
            results.append(f"✓ {label_text} → {value}")
        except Exception as e:
            results.append(f"✗ {label_text}: {e}")

    if submit_selector:
        try:
            browser_control({"action": "click", "selector": submit_selector})
            results.append(f"✓ Submitted via {submit_selector}")
        except Exception as e:
            results.append(f"✗ Submit failed: {e}")

    return "\n".join(results)
