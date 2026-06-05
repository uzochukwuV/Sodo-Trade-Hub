---
name: React pagination pattern
description: Correct pattern for accumulating paginated data in React with TanStack Query
---

## Rule
Use `useEffect` to sync fetched data into an accumulated list. Never call `setState` in the render body.

## Why
Setting state in the render body (even guarded with refs) violates React's rules of hooks and causes infinite re-render loops or stale state in strict mode.

## How to apply
```tsx
const [allItems, setAllItems] = useState<Item[]>([]);
const [offset, setOffset] = useState(0);
const [hasMore, setHasMore] = useState(true);

// Reset on filter/tab change
useEffect(() => {
  setAllItems([]);
  setOffset(0);
  setHasMore(true);
}, [tab]);

// Sync initial page into accumulated list
useEffect(() => {
  if (data?.items) {
    setAllItems(data.items);
    setHasMore(data.items.length >= PAGE_SIZE);
    setOffset(0);
  }
}, [data]);

// Load more appends via manual fetch
const loadMore = async () => {
  const newOffset = offset + PAGE_SIZE;
  const res = await fetch(`/api/resource?limit=${PAGE_SIZE}&offset=${newOffset}`);
  const d = await res.json();
  setAllItems(prev => [...prev, ...(d.items ?? [])]);
  setOffset(newOffset);
  setHasMore((d.items?.length ?? 0) >= PAGE_SIZE);
};
```

This pattern is used in Feed.tsx and Intents.tsx. CopyTrading uses a simpler `limit` bump approach (increases the query limit to show more leaders).
