// Minimal session and response utilities for API routes

export const ApiResponse = {
  success(data = null, message = 'OK') {
    return { success: true, data, message };
  },
  error(message = 'Error', status = 500) {
    return { success: false, message, status };
  },
  validation(errors = {}) {
    return { success: false, status: 'validation_error', errors };
  },
};

// Optional: stub session helpers for local/dev
export async function getSession(req) {
  // In production, implement real session lookup
  return { user: { id: 'dev-user' } };
}
