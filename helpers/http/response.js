const ok = (res, data, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data,
  });
};

const fail = (res, message = 'Error', status = 400, data = null) => {
  return res.status(status).json({
    success: false,
    message,
    data,
  });
};

export { ok, fail };
