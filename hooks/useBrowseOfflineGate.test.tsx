import { configureStore } from "@reduxjs/toolkit";
import React from "react";
import { Provider } from "react-redux";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { tmdbApi, useListQuery } from "@/src/store/services/tmdbApi";
import { workerApi } from "@/src/store/services/workerApi";
import { fetchList } from "@/utils/tmdbLists";
import { useBrowseOfflineGate } from "./useBrowseOfflineGate";

jest.mock("@/hooks/useConnectivity", () => ({ useConnectivity: () => false }));
jest.mock("@/utils/tmdbLists", () => ({
  ...jest.requireActual("@/utils/tmdbLists"),
  fetchList: jest.fn(),
}));

const mockFetchList = fetchList as jest.Mock;

function makeStore() {
  return configureStore({
    reducer: {
      [tmdbApi.reducerPath]: tmdbApi.reducer,
      [workerApi.reducerPath]: workerApi.reducer,
    },
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }).concat(tmdbApi.middleware, workerApi.middleware),
    // RTK batches subscriber notifications on requestAnimationFrame by default, which fires after Jest tears down.
    enhancers: (gde) => gde({ autoBatch: { type: "tick" } }),
  });
}

let reload: () => void;
let railIds: (number[] | undefined)[];
function HomeProbe({ onRender }: { onRender: (reload: () => void, ids: number[] | undefined) => void }) {
  const { reload } = useBrowseOfflineGate();
  const { data } = useListQuery("movie/popular");
  onRender(reload, data?.map((m) => m.id));
  return null;
}
const record = (r: () => void, ids: number[] | undefined) => {
  reload = r;
  railIds.push(ids);
};

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

describe("useBrowseOfflineGate reload (pull-to-refresh)", () => {
  let store: ReturnType<typeof makeStore>;
  let tree: ReactTestRenderer;

  beforeEach(() => {
    railIds = [];
    store = makeStore();
    mockFetchList.mockReset();
  });

  afterEach(() => {
    act(() => tree.unmount());
    store.dispatch(tmdbApi.util.resetApiState());
    store.dispatch(workerApi.util.resetApiState());
  });

  it("keeps showing loaded rails while it refetches them, then shows the fresh items", async () => {
    let fresh = false;
    mockFetchList.mockImplementation(async (path: string) =>
      path === "movie/popular" ? (fresh ? [{ id: 2 }] : [{ id: 1 }]) : [],
    );
    act(() => {
      tree = create(
        <Provider store={store}>
          <HomeProbe onRender={record} />
        </Provider>,
      );
    });
    await flush();
    expect(railIds[railIds.length - 1]).toEqual([1]);

    fresh = true;
    const before = railIds.length;
    act(() => reload());
    await flush();

    // Never back to "loading" (undefined) — that swapped every rail to its skeleton at once.
    expect(railIds.slice(before)).not.toContainEqual(undefined);
    expect(railIds[railIds.length - 1]).toEqual([2]);
  });

  it("retries a rail whose first load failed (the offline page's Try again)", async () => {
    let online = false;
    mockFetchList.mockImplementation(async (path: string) => {
      if (!online) throw new Error("Network request failed");
      return path === "movie/popular" ? [{ id: 7 }] : [];
    });
    act(() => {
      tree = create(
        <Provider store={store}>
          <HomeProbe onRender={record} />
        </Provider>,
      );
    });
    await flush();
    expect(railIds[railIds.length - 1]).toBeUndefined();

    online = true;
    act(() => reload());
    await flush();

    expect(railIds[railIds.length - 1]).toEqual([7]);
  });
});
