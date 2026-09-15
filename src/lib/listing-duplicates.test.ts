import { describe, expect, it } from "vitest";
import { listingDuplicateCandidates } from "./listing-duplicates";
const row = { id:"1", locationId:"Dubai", directory:"Google", url:"https://maps.google.com/place/a", status:"correct" };
describe("listing duplicate review", () => {
  it("flags competing listings within one directory without merging different locations", () => {
    const rows=[row,{...row,id:"2",directory:" google ",url:"https://maps.google.com/place/b"},{...row,id:"3",locationId:"London",url:"https://maps.google.com/place/c"}];
    expect([...listingDuplicateCandidates(rows).keys()]).toEqual(["1","2"]);
    expect(rows[0].status).toBe("correct");
  });
  it("identifies repeated URLs across locations, excluding missing records and empty URLs", () => {
    expect(listingDuplicateCandidates([row,{...row,id:"2",locationId:"London",url:`${row.url}#reviews`}]).size).toBe(2);
    expect(listingDuplicateCandidates([row,{...row,id:"2",status:"missing"},{...row,id:"3",url:null}]).size).toBe(0);
  });
});
