use Future::AsyncAwait;

async sub f { }
# <- keyword
async sub { };
# <- keyword

await f();
# <- keyword
