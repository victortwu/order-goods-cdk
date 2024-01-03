const goodsHandler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Hello from OrderGoods handler!",
    }),
  };
};

export { goodsHandler };
