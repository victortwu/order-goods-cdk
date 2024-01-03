const listsHandler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Hello from OrderGoodsLists handler!",
    }),
  };
};

export { listsHandler };
