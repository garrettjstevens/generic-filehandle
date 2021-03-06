import fetchMock from "fetch-mock";
import { LocalFile, RemoteFile } from "../src/";
import rangeParser from "range-parser";
fetchMock.config.sendAsJson = false;

const getFile = (url: string) =>
  new LocalFile(require.resolve(url.replace("http://fakehost/", "./data/")));
// fakes server responses from local file object with fetchMock
const readBuffer = async (url: string, args: any) => {
  const file = getFile(url);
  const range = rangeParser(10000, args.headers.range);
  // @ts-ignore
  const { start, end } = range[0];
  const len = end - start;
  let buf = Buffer.alloc(len);
  const bytesRead = await file.read(buf, 0, len, start);
  const stat = await file.stat();
  buf = buf.slice(0, bytesRead);
  return {
    status: 206,
    body: buf,
    headers: { "Content-Range": `${start}-${end}/${stat.size}` }
  };
};

const readFile = async (url: string) => {
  const file = getFile(url);
  const ret = await file.readFile();
  return {
    status: 200,
    body: ret
  };
};

describe("remote file tests", () => {
  afterEach(() => fetchMock.restore());

  it("reads file", async () => {
    fetchMock.mock("http://fakehost/test.txt", readFile);
    const f = new RemoteFile("http://fakehost/test.txt");
    const b = await f.readFile();
    expect(b.toString()).toEqual("testing\n");
  });
  it("reads remote partially", async () => {
    fetchMock.mock("http://fakehost/test.txt", readBuffer);
    const f = new RemoteFile("http://fakehost/test.txt");
    const buf = Buffer.allocUnsafe(3);
    const bytesRead = await f.read(buf, 0, 3, 0);
    expect(buf.toString()).toEqual("tes");
    expect(bytesRead).toEqual(3);
  });
  it("reads remote clipped at the end", async () => {
    fetchMock.mock("http://fakehost/test.txt", readBuffer);
    const f = new RemoteFile("http://fakehost/test.txt");
    const buf = Buffer.allocUnsafe(3);
    const bytesRead = await f.read(buf, 0, 3, 6);
    expect(buf.slice(0, bytesRead).toString()).toEqual("g\n");
    expect(bytesRead).toEqual(2);
  });
  it("length infinity", async () => {
    fetchMock.mock("http://fakehost/test.txt", readBuffer);
    const f = new RemoteFile("http://fakehost/test.txt");
    const buf = Buffer.allocUnsafe(5);
    const bytesRead = await f.read(buf, 0, Infinity, 3);
    expect(buf.toString()).toEqual("ting\n");
    expect(bytesRead).toEqual(5);
  });
  it("throws error", async () => {
    fetchMock.mock("http://fakehost/test.txt", 500);
    const f = new RemoteFile("http://fakehost/test.txt");
    const buf = Buffer.alloc(10);
    const res = f.read(buf, 0, 0, 0);
    await expect(res).rejects.toThrow(/fetching/);
  });
  it("stat", async () => {
    fetchMock.mock("http://fakehost/test.txt", readBuffer);
    const f = new RemoteFile("http://fakehost/test.txt");
    const stat = await f.stat();
    expect(stat.size).toEqual(8);
  });
});
