import { Platform } from 'react-native';
import { ConsumptionForecast, Product, ShoppingTripPlan, UserProfile } from '../domain/types';

export interface ScheduledReminderSummary {
  supported: boolean;
  scheduledCount: number;
  nextTripReminderAt: string | null;
  spoilageAlertsCount: number;
}

/**
 * Schedules local iOS & Android smart notifications via expo-notifications:
 * 1. Optimal Shopping Trip Reminder (morning of recommended trip day)
 * 2. Spoilage Rescue Alert (for high-risk perishables expiring within 48h)
 */
export async function syncSmartNotifications(params: {
  tripPlan: ShoppingTripPlan;
  forecasts: Record<string, ConsumptionForecast>;
  products: Product[];
  profile: UserProfile;
}): Promise<ScheduledReminderSummary> {
  const { tripPlan, forecasts, products, profile } = params;

  if (Platform.OS === 'web' || !profile.remindersEnabled) {
    return {
      supported: Platform.OS !== 'web',
      scheduledCount: 0,
      nextTripReminderAt: profile.remindersEnabled ? tripPlan.reminderDate : null,
      spoilageAlertsCount: 0,
    };
  }

  try {
    const Notifications = await import('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    const perms = await Notifications.getPermissionsAsync();
    let granted = perms.status === 'granted';
    if (!granted) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.status === 'granted';
    }
    if (!granted) {
      return {
        supported: true,
        scheduledCount: 0,
        nextTripReminderAt: null,
        spoilageAlertsCount: 0,
      };
    }

    await Notifications.cancelAllScheduledNotificationsAsync();

    let scheduledCount = 0;

    // 1. Optimal grocery trip reminder
    const triggerDate = new Date(tripPlan.reminderDate);
    if (triggerDate.getTime() > Date.now() + 60_000 && tripPlan.items.length > 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Smart Shop Reminder (${tripPlan.items.length} items)`,
          body: `${tripPlan.reason}. Est. basket: $${tripPlan.estimatedTotal.toFixed(2)}.`,
          data: { screen: 'shop', tripId: tripPlan.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
      scheduledCount += 1;
    }

    // 2. Spoilage risk alerts for items expiring within 2 days
    const productMap = new Map(products.map((p) => [p.id, p]));
    const risky = Object.values(forecasts).filter(
      (f) =>
        f.currentStock > 0 &&
        f.spoilageRiskScore >= 0.45 &&
        f.daysUntilEarliestExpiry !== null &&
        f.daysUntilEarliestExpiry <= 2
    );

    if (risky.length > 0) {
      const names = risky
        .slice(0, 2)
        .map((r) => productMap.get(r.productId)?.name ?? 'Item')
        .join(' & ');
      const alertTime = new Date(Date.now() + 4 * 3600 * 1000);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Use Soon — Prevent Food Waste',
          body: `${names} will expire before projected depletion. Tap for a zero-waste meal idea.`,
          data: { screen: 'index' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: alertTime,
        },
      });
      scheduledCount += 1;
    }

    return {
      supported: true,
      scheduledCount,
      nextTripReminderAt: tripPlan.reminderDate,
      spoilageAlertsCount: risky.length,
    };
  } catch {
    return {
      supported: false,
      scheduledCount: 0,
      nextTripReminderAt: tripPlan.reminderDate,
      spoilageAlertsCount: 0,
    };
  }
}
