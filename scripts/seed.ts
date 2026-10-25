// Seal a round of realistic bot orders into the auction taking commitments.
//   npm run seed
import { seed } from "./lib/demo.js";

const steps = await seed(console.log);
steps.forEach((s) => console.log(`  ${s.label}  ${s.link ?? ""}`));
