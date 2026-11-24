export type NotificationType =
  | 'SIGNAL_CHANGED'
  | 'CONFIDENCE_CHANGED'
  | 'RISK_CHANGED'
  | 'NEWS_ALERT'
  | 'ECONOMIC_EVENT'
  | 'PRICE_ALERT'
  | 'REGIME_CHANGED'
  | 'MODEL_DRIFT';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}
