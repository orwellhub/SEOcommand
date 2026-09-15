import {describe,expect,it} from "vitest";
import {joinOrganicLandingPages,landingKey} from "./organic-insights";
describe("organic landing-page joins",()=>{
 it("preserves case and query strings and rejects foreign hosts",()=>{expect(landingKey("https://www.example.com/Booking?q=A","example.com")).toBe("/Booking?q=A");expect(landingKey("https://other.com/Booking","example.com")).toBeNull();expect(landingKey("(not set)","example.com")).toBeNull();});
 it("combines matching page evidence without inventing missing analytics",()=>{const rows=joinOrganicLandingPages([{key:"https://example.com/guide",clicks:10,impressions:100,ctr:10,position:5},{key:"https://example.com/other",clicks:2,impressions:20,ctr:10,position:8}],[{landingPage:"/guide",sessions:12,totalUsers:10,engagementRate:50,conversions:2}],"example.com");expect(rows[0]!.analytics!.sessions).toBe(12);expect(rows[1]!.analytics).toBeNull();});
 it("weights positions using impressions when canonical host variants join",()=>{const rows=joinOrganicLandingPages([{key:"https://example.com/",clicks:10,impressions:100,ctr:10,position:2},{key:"https://www.example.com/",clicks:1,impressions:10,ctr:10,position:13}],[],"example.com");expect(rows[0]!.search!.position).toBe(3);expect(rows[0]!.search!.ctr).toBe(10);});
});
