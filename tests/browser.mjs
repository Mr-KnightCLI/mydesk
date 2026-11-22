import test from "node:test";
import assert from "node:assert/strict";
import {parseBrowse} from "../lib/browser.ts";

test("browser requests preserve the selected browser and search terms",()=>{
  for(const [command,browser,term] of [
    ["browse linked lists on Brave","Brave","linked lists"],
    ["Open Chrome and search for tennis","Chrome","tennis"],
    ["use Firefox to look up coffee","Firefox","coffee"],
    ["search for C++ & C# in Edge","Edge","C++ & C#"],
  ]){
    const action=parseBrowse(command);
    assert.equal(action.browser,browser);
    assert.equal(new URL(action.url).searchParams.get("q"),term);
  }
  assert.equal(parseBrowse("open Wikipedia in Chrome").url,"https://www.wikipedia.org/");
  assert.equal(parseBrowse("open Calculator"),undefined);
  assert.equal(parseBrowse("open Brave").browser,"Brave");
  assert.equal(typeof parseBrowse("open file:///test in Chrome"),"string");
});

test("everyday launch requests select an actual desktop action",()=>{
  for(const [text,browser] of [["open the web browser","default browser"],["open my browser","default browser"],["start Brave","Brave"],["launch the Google Chrome browser","Chrome"]]){
    assert.equal(parseBrowse(text)?.browser,browser);
  }
});
