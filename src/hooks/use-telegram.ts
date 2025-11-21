import { useEffect, useState } from 'react';
import { useKV } from '@/hooks/use-kv-polyfill';
import { createTelegramNotifier, type TelegramConfig, type TradeNotification, type ErrorNotification } from '@/lib/telegram';

export function useTelegram() {
  const [telegramBotToken] = useKV('telegram-bot-token', '');
  const [telegramChatId] = useKV('telegram-chat-id', '');
  const [telegramEnabledRaw] = useKV('telegram-enabled', 'false');
  
  const [notifier, setNotifier] = useState<ReturnType<typeof createTelegramNotifier> | null>(null);

  useEffect(() => {
    const enabled = telegramEnabledRaw === 'true';
    
    if (enabled && telegramBotToken && telegramChatId) {
      const config: TelegramConfig = {
        botToken: telegramBotToken,
        chatId: telegramChatId,
        enabled: true,
      };
      
      setNotifier(createTelegramNotifier(config));
    } else {
      setNotifier(null);
    }
  }, [telegramBotToken, telegramChatId, telegramEnabledRaw]);

  const sendTradeOpened = async (notification: TradeNotification) => {
    if (!notifier) return false;
    return notifier.sendTradeOpened(notification);
  };

  const sendTradeClosed = async (notification: TradeNotification) => {
    if (!notifier) return false;
    return notifier.sendTradeClosed(notification);
  };

  const sendError = async (notification: ErrorNotification) => {
    if (!notifier) return false;
    return notifier.sendError(notification);
  };

  return {
    enabled: !!notifier,
    sendTradeOpened,
    sendTradeClosed,
    sendError,
  };
}
