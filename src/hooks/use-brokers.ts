import { useState, useEffect } from 'react';
import { getBrokers, BrokerMetadata, BrokersResponse } from '@/lib/broker-api';

interface UseBrokersResult {
  brokers: BrokerMetadata[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useBrokers(): UseBrokersResult {
  const [brokers, setBrokers] = useState<BrokerMetadata[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBrokers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response: BrokersResponse = await getBrokers();
      
      if (response.success) {
        setBrokers(response.data);
      } else {
        setError('Failed to fetch brokers');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBrokers();
  }, []);

  return {
    brokers,
    loading,
    error,
    refetch: fetchBrokers,
  };
}
