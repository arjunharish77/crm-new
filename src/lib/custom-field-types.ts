// The input a record form shows for a custom field's type. Fields are stored with their own type
// names (DROPDOWN, BOOLEAN, CURRENCY…), and some screens send the older names (SELECT, CHECKBOX);
// the form only knows TEXT, TEXTAREA, NUMBER, DROPDOWN, MULTI_SELECT, BOOLEAN, DATE and DATETIME.
export function formFieldType(type: unknown) {
  switch (String(type ?? "").toUpperCase()) {
    case "SELECT":
    case "DROPDOWN":
    case "PICKLIST":
      return "DROPDOWN";
    case "MULTISELECT":
    case "MULTI_SELECT":
      return "MULTI_SELECT";
    case "CHECKBOX":
    case "BOOLEAN":
      return "BOOLEAN";
    case "NUMBER":
    case "CURRENCY":
    case "PERCENT":
    case "DECIMAL":
      return "NUMBER";
    case "DATE":
      return "DATE";
    case "DATETIME":
      return "DATETIME";
    case "TEXTAREA":
    case "LONG_TEXT":
      return "TEXTAREA";
    default:
      return "TEXT";
  }
}
