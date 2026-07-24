/* eslint-disable no-console */

process.env.DATA_ACCESS_MODE = process.env.DATA_ACCESS_MODE || "postgres";

require("./seed-demo-test-data");
