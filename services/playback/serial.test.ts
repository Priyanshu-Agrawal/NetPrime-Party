import { oneAtATime } from "./serial";

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe("oneAtATime", () => {
  it("runs tasks one after another", async () => {
    const run = oneAtATime();
    const order: string[] = [];
    let releaseA!: () => void;
    const a = run(() => new Promise<string>((res) => (releaseA = () => res("a"))).then((v) => (order.push(v), v)));
    const b = run(async () => (order.push("b"), "b"));
    await flush();
    expect(order).toEqual([]);
    releaseA();
    await expect(a).resolves.toBe("a");
    await expect(b).resolves.toBe("b");
    expect(order).toEqual(["a", "b"]);
  });

  it("skips a task whose caller has gone by the time its turn comes", async () => {
    const run = oneAtATime();
    let releaseA!: () => void;
    void run(() => new Promise<void>((res) => (releaseA = res)));
    const task = jest.fn(async () => "b");
    let alive = true;
    const b = run(task, () => alive);
    await flush();
    alive = false;
    releaseA();
    await expect(b).resolves.toBeUndefined();
    expect(task).not.toHaveBeenCalled();
  });

  it("a failed task doesn't block the next", async () => {
    const run = oneAtATime();
    const a = run(async () => {
      throw new Error("boom");
    });
    const b = run(async () => "b");
    await expect(a).rejects.toThrow("boom");
    await expect(b).resolves.toBe("b");
  });
});
