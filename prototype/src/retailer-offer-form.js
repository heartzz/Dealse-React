const optionalTextFields = ["summary", "details", "imageReference"];

export function normalizeOptionalOfferFields(record = {}) {
  return Object.fromEntries(optionalTextFields.map((field) => [
    field,
    typeof record[field] === "string" ? record[field] : "",
  ]));
}

export function optionalOfferPayload(form, { editing = false } = {}) {
  return Object.fromEntries(optionalTextFields.flatMap((field) => {
    const value = typeof form[field] === "string" ? form[field].trim() : "";
    if (value) return [[field, value]];
    return editing ? [[field, null]] : [];
  }));
}
