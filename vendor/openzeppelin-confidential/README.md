# OpenZeppelin confidential token contracts (vendored wasm)

Used only with `CONFIDENTIAL_DEPOSITS=true`. Built with `stellar contract build` (soroban-sdk 28.0.0) from
[brozorec/stellar-confidential-token-demo](https://github.com/brozorec/stellar-confidential-token-demo)
at `626d00fae71f48a49e4bcbc6291427b30b2dfa46`, whose `contracts/` vendor OpenZeppelin
[stellar-contracts](https://github.com/OpenZeppelin/stellar-contracts) **v0.8.0** examples
(`stellar-confidential = "=0.8.0"`): `verifier`, `auditor`, `vanilla-token`.

The verifier wraps NethermindEth rs-soroban-ultrahonk, **non-zero-knowledge** UltraHonk only
(OpenZeppelin README: "The verifier implements only the non-zk UltraHonk flavour").
Verification keys come from stellar-confidential-token-sdk `aad1706` (`circuits/vks/`, nargo 1.0.0-beta.11, bb 0.87.0).

sha256:

```
32546d5c2eb4964a63500c3420cb08fdde824a46e2cdacece17f6ad2e51686bc  confidential_auditor_example.wasm
2e9b1e586ce975a2012fc9c476bac33ed80e76ee81bd0ae45518fd20d3a08e79  confidential_vanilla_token_example.wasm
3f9019f354f72176f03b137c13fe5204ef906a48bbeb876e4d520172f1a0c248  confidential_verifier_example.wasm
```
