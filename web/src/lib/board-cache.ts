'use client';

import { useQueryClient } from '@tanstack/react-query';

export function useInvalidateBoardCache() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['board'] });
}
