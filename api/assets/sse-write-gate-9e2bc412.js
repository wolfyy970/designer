function createWriteGate() {
  let tail = Promise.resolve();
  return {
    enqueue(fn) {
      const next = tail.then(fn);
      tail = next.catch((e) => {
        if (e != null) {
          console.error("[write-gate]", e);
        }
      });
      return next;
    }
  };
}
export {
  createWriteGate as c
};
