// Assuming you have an enum for AccountVariantType
enum AccountVariantType {
    OpenZeppelinLegacy,
    ArgentLegacy,
    Braavos,
    Argent,
    OpenZeppelin,
  }
  
  
  // Define the KnownAccountClass interface
  export interface KnownAccountClass {
    class_hash: string;
    variant: AccountVariantType;
    description: string;
  }
  
  // Define the array of KnownAccountClass
  export const KNOWN_ACCOUNT_CLASSES: KnownAccountClass[] = [
    {
      class_hash: "0x048dd59fabc729a5db3afdf649ecaf388e931647ab2f53ca3c6183fa480aa292",
      variant: AccountVariantType.OpenZeppelinLegacy,
      description: "OpenZeppelin account contract v0.6.1 compiled with cairo-lang v0.11.0.2",
    },
    {
      class_hash: "0x04d07e40e93398ed3c76981e72dd1fd22557a78ce36c0515f679e27f0bb5bc5f",
      variant: AccountVariantType.OpenZeppelinLegacy,
      description: "OpenZeppelin account contract v0.5.0 compiled with cairo-lang v0.10.1",
    },
    {
      class_hash: "0x025ec026985a3bf9d0cc1fe17326b245dfdc3ff89b8fde106542a3ea56c5a918",
      variant: AccountVariantType.ArgentLegacy,
      description: "Argent X legacy (Cairo 0) proxy account",
    },
    {
      class_hash: "0x03131fa018d520a037686ce3efddeab8f28895662f019ca3ca18a626650f7d1e",
      variant: AccountVariantType.Braavos,
      description: "Braavos official proxy account (legacy)",
    },
    {
      class_hash: "0x0553efc3f74409b08e7bc638c32cadbf1d7d9b19b2fdbff649c7ffe186741ecf",
      variant: AccountVariantType.Braavos,
      description: "Braavos official proxy account (as of v3.33.3)",
    },
    {
      class_hash: "0x01a736d6ed154502257f02b1ccdf4d9d1089f80811cd6acad48e6b6a9d1f2003",
      variant: AccountVariantType.Argent,
      description: "Argent X official account",
    },
    {
      class_hash: "0x04c6d6cf894f8bc96bb9c525e6853e5483177841f7388f74a46cfda6f028c755",
      variant: AccountVariantType.OpenZeppelin,
      description: "OpenZeppelin account contract v0.7.0 compiled with cairo v2.2.0",
    },
    {
      class_hash: "0x05400e90f7e0ae78bd02c77cd75527280470e2fe19c54970dd79dc37a9d3645c",
      variant: AccountVariantType.OpenZeppelin,
      description: "OpenZeppelin account contract v0.8.0 compiled with cairo v2.3.1",
    },
  ];
  