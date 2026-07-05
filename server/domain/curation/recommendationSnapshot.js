export function createRecommendationSnapshot(queue) {
  return {
    future: [...(queue.future || [])],
    current: queue.current ? { ...queue.current } : null,
  };
}
