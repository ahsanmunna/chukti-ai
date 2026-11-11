/**
 * Explicit error thrown by unfinished pipeline stages so unimplemented steps
 * fail loudly instead of returning fake or mocked output.
 */
export class NotImplementedError extends Error {
  readonly step: string;

  constructor(step: string, message?: string) {
    super(message ?? `${step} is not implemented yet.`);
    this.name = "NotImplementedError";
    this.step = step;
  }
}
