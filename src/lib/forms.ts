export type ActionState = { error?: string; message?: string };

export function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
