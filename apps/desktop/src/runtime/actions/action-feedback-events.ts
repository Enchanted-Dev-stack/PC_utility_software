import type { ActionFeedbackEvent } from "../../../../../shared/src/contracts/actions/action-feedback";

export type ActionFeedbackListener = (event: ActionFeedbackEvent) => void;

export class ActionFeedbackEvents {
  private readonly listeners: Set<ActionFeedbackListener>;

  public constructor() {
    this.listeners = new Set<ActionFeedbackListener>();
  }

  public emit(event: ActionFeedbackEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  public subscribe(listener: ActionFeedbackListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
