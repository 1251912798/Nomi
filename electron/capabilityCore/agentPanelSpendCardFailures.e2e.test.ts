import { afterEach, describe, expect, it } from "vitest";

import { describeGenerateOutcome } from "../shared/agentLane/generateOutcomeReceipt";
import { generationPresentationOutcome } from "../shared/productionGenerationPresentation";
import { VendorRequestError } from "../vendor/vendorHttp";
import { PROJECT_ID, resetSpendFixture, shotsDraft, spendWorld } from "./agentPanelSpendConfirmTestUtils";

// 失败留在卡里（D2 第③步 3.7）：哪一段、发没发、下一步 + 一颗对应按钮。账本里每一镜的交接落定就是卡读的那一份——
//   · 确定没发出去（本机判得出 / 没连上 / 窗口没了）→「先不发了」·「再试一次」；
//   · 参数被拒（供应商当场拒 / 预演没好 / 本机判出参数不对）→「先不发了」·「去改镜 N」；
//   · 结果未知（写出去之后断了）→ 卡上照实说要核对，**绝不说没花钱**，也不许再交一次。
// 这里钉主进程那一半：每一种失败落成哪一种 offer / failure、供应商收到几笔、回执怎么说。按钮与文案在渲染层的卡测试里。

afterEach(resetSpendFixture);

function rejection(): VendorRequestError {
  return new VendorRequestError("Provider request failed (HTTP 400): content policy", { vendorKey: "acme", method: "POST", url: "x", httpStatus: 400, upstreamMsg: "content policy", category: "input", retryable: false }, { httpStatus: 400, envelopeFailure: false, taskIdReturned: false });
}

const offers = (world: ReturnType<typeof spendWorld>) => world.pending()?.shots.map((shot) => [shot.shotId, shot.offer, shot.failure?.kind ?? null, shot.failure?.code ?? null]);

describe("没发出去：本机就判得出来（债 a：交给画布之前判）", () => {
  it("第 2 镜缺参考图：渲染层跳过并说原因 → 这一镜「参数被拒·去改」，另两镜照常发；改好之后「再试一次」只发它", async () => {
    let missingReference = true;
    const world = spendWorld({ validateNode: (node) => node.shotId === "shot-2" && missingReference ? { kind: "parameter_rejected", code: "reference_required" } : null });
    await shotsDraft(world);
    await world.generate();
    await world.renderer.drain();
    expect(world.sentShots().sort()).toEqual(["shot-1", "shot-3"]);
    expect(offers(world)).toEqual([
      ["shot-1", "sent", null, null],
      ["shot-2", "not_sent", "parameter_rejected", "reference_required"],
      ["shot-3", "sent", null, null],
    ]);
    expect(world.remainingOn(world.pending()!), "主按钮此刻递的就是那一镜（「再试一次」）").toEqual(["shot-2"]);
    missingReference = false;
    await world.generate();
    await world.renderer.drain();
    expect(world.sentShots().sort()).toEqual(["shot-1", "shot-2", "shot-3"]);
    expect(world.pending(), "三镜都交到了，卡关").toBeUndefined();
  });

  it("交接那一问渲染层不在（窗口关了）：一镜不发，每一镜都「没发出去·再试一次」；窗口回来再试一次就发", async () => {
    const world = spendWorld();
    await shotsDraft(world, [{}, {}]);
    world.renderer.setHandOverFailing(true);
    expect(await world.generate()).toEqual({ ok: true, code: "handed_over" });
    expect(world.vendor.executes).toEqual([]);
    expect(offers(world)).toEqual([["shot-1", "not_sent", "not_sent", "renderer_unavailable"], ["shot-2", "not_sent", "not_sent", "renderer_unavailable"]]);
    world.renderer.setHandOverFailing(false);
    await world.generate();
    await world.renderer.drain();
    expect(world.sentShots().sort()).toEqual(["shot-1", "shot-2"]);
  });

  it("落不到画布上：不交、卡留在原地说没发出去；落得下之后再试一次就落下、只发一次", async () => {
    const world = spendWorld();
    world.renderer.setLandingFailing(true);
    await shotsDraft(world, [{}]);
    expect(world.renderer.nodes.size, "起草时就没落下").toBe(0);
    await world.generate();
    await world.renderer.drain();
    expect(world.vendor.executes).toEqual([]);
    expect(offers(world)?.[0]?.slice(0, 3)).toEqual(["shot-1", "not_sent", "not_sent"]);
    world.renderer.setLandingFailing(false);
    await world.generate();
    await world.renderer.drain();
    expect(world.renderer.nodes.size).toBe(1);
    expect(world.sentShots()).toEqual(["shot-1"]);
  });

  it("节点上正好有一笔不归这张卡的在交（同节点在途）：这一镜落成「没发出去」并说原因，不卡在「正在发出」；另一镜照发", async () => {
    const world = spendWorld();
    await shotsDraft(world, [{}, {}]);
    const nodeId = world.renderer.nodeOf("shot-1")!.nodeId;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = world.vendor.answer;
    world.vendor.answer = async (call) => { if (call === 1) await gate; return original(call); };
    // 用户在这个节点上点过一次与这份计划无关的生成（没带制作链接），还在供应商门口。
    const unrelated = world.canvas.submit(nodeId, "rr-unrelated");
    await world.generate();
    await world.renderer.drain();
    expect(offers(world)).toEqual([["shot-1", "not_sent", "not_sent", "node_generation_in_flight"], ["shot-2", "sent", null, null]]);
    expect(world.sentShots()).toEqual([nodeId, "shot-2"]);
    release();
    await unrelated;
    expect(world.vendor.executes, "同一个节点只发了那一笔无关的：卡交的这一镜一个字节没发").toHaveLength(2);
  });

  it("节点上一笔与这份计划无关的生成结果未知（要先核对）：卡交的这一镜不发，落成「没发出去」并说要先核对", async () => {
    const world = spendWorld();
    await shotsDraft(world, [{}]);
    const nodeId = world.renderer.nodeOf("shot-1")!.nodeId;
    const original = world.vendor.answer;
    world.vendor.answer = async (call) => { if (call === 1) throw new Error("acme create failed: socket hang up"); return original(call); };
    await expect(world.canvas.submit(nodeId, "rr-unrelated")).rejects.toBeTruthy();
    await world.generate();
    await world.renderer.drain();
    expect(offers(world)).toEqual([["shot-1", "not_sent", "not_sent", "node_needs_reconcile"]]);
    expect(world.vendor.executes, "防双扣：同节点那一笔结果未知，这一镜一个字节没发").toHaveLength(1);
  });

  it("3D-BOX 预演没好：派发闸拒，这一镜「参数被拒·去改」（点了去节点），一个字节不发", async () => {
    const world = spendWorld({ previewBlock: "preview_not_ready" as never });
    await shotsDraft(world, [{}]);
    await world.generate();
    await world.renderer.drain();
    expect(world.vendor.executes).toEqual([]);
    expect(offers(world)).toEqual([["shot-1", "not_sent", "parameter_rejected", "director_preview_blocked"]]);
  });
});

describe("参数被拒：供应商当场明确拒绝", () => {
  it("HTTP 400：这一镜「参数被拒·去改」、没花钱；卡关之后回执说它没被受理、没花钱", async () => {
    const world = spendWorld();
    await shotsDraft(world, [{}, {}]);
    const original = world.vendor.answer;
    world.vendor.answer = async (call) => { if (call === 1) throw rejection(); return original(call); };
    await world.generate();
    await world.renderer.drain();
    expect(world.vendor.executes, "被拒的那一笔确实到过供应商").toHaveLength(2);
    expect(offers(world)).toEqual([["shot-1", "not_sent", "parameter_rejected", "provider_rejected"], ["shot-2", "sent", null, null]]);
    await world.cancel();
    const outcome = generationPresentationOutcome(world.run())!;
    expect(outcome).toMatchObject({ generating: ["shot-2"], failedBeforeSending: ["shot-1"] });
    const receipt = describeGenerateOutcome(outcome).userSees;
    expect(receipt).toContain("failed before the provider accepted it");
    expect(receipt).toContain("nothing was spent for these");
  });
});

describe("结果未知：写出去之后断了", () => {
  it("这一镜「结果未知」留在卡上；不许再交一次（钱可能已经花了）；回执把它算进在生成，绝不说没花钱", async () => {
    const world = spendWorld();
    await shotsDraft(world, [{}, {}]);
    const original = world.vendor.answer;
    world.vendor.answer = async (call) => { if (call === 1) throw new Error("acme create failed: socket hang up"); return original(call); };
    await world.generate();
    await world.renderer.drain();
    expect(offers(world)).toEqual([["shot-1", "unknown", null, null], ["shot-2", "sent", null, null]]);
    expect(world.remainingOn(world.pending()!), "主按钮没有可递的镜").toEqual([]);
    expect(await world.generate(["shot-1"])).toMatchObject({ ok: false, message: "generation_quote_changed" });
    await world.renderer.drain();
    expect(world.vendor.executes, "防双扣：一镜一笔").toHaveLength(2);
    await world.cancel();
    const outcome = generationPresentationOutcome(world.run())!;
    expect(outcome.generating).toEqual(["shot-1", "shot-2"]);
    expect(outcome.failedBeforeSending).toEqual([]);
    expect(describeGenerateOutcome(outcome).userSees).not.toContain("nothing was spent");
  });
});

describe("「再试一次」是一次新的尝试：新的交接、新的画布 Run、新的幂等键", () => {
  it("没发出去的那一镜再试一次：账本记第二笔交接，供应商收到的是另一个幂等键", async () => {
    const world = spendWorld();
    await shotsDraft(world, [{}]);
    world.renderer.setHandOverFailing(true);
    await world.generate();
    world.renderer.setHandOverFailing(false);
    await world.generate();
    await world.renderer.drain();
    const handOvers = world.run().generationPlan!.presentations!.at(-1)!.handOvers!;
    expect(handOvers.map((entry) => entry.settled?.outcome)).toEqual(["not_sent", "accepted"]);
    expect(handOvers[0].canvasRunId).toBeUndefined();
    expect(handOvers[1].canvasRunId).toBeTruthy();
    expect(world.vendor.executes).toHaveLength(1);
    expect(world.repository.read(PROJECT_ID, handOvers[1].canvasRunId!)?.jobs).toHaveLength(1);
  });
});
