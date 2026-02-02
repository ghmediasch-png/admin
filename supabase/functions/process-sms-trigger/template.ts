// =====================================================
// Template Processing
// Description: Replace placeholders with actual values
// =====================================================

export function processTemplate(template: string, data: Record<string, any>): string {
  let message = template;

  // Replace all {placeholder} with actual values
  const placeholderRegex = /\{([a-zA-Z0-9_]+)\}/g;

  message = message.replace(placeholderRegex, (match, key) => {
    // Check if key exists in data
    if (data.hasOwnProperty(key)) {
      const value = data[key];
      
      // Handle null/undefined
      if (value === null || value === undefined) {
        console.warn(`⚠️ Placeholder {${key}} is null/undefined`);
        return "";
      }
      
      return String(value);
    }
    
    // Key not found - log warning and keep placeholder
    console.warn(`⚠️ Placeholder {${key}} not found in template_data`);
    return match;
  });

  return message;
}

// Validate that all required fields exist in data
export function validateRequiredFields(
  requiredFields: string[],
  data: Record<string, any>
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const field of requiredFields) {
    if (!data.hasOwnProperty(field) || data[field] === null || data[field] === undefined) {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}