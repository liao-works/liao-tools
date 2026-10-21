import hashlib
import json
import os

import zstandard

HERE = os.path.dirname(os.path.abspath(__file__))

rows = []
for i in range(2048):
    code = f'{i % 10000:04d}' * 2 + f'{i:02d}'
    rows.append(
        "({i},'{code}','{a}.{b}%','United Kingdom tariff line {code} - description of goods, "
        "classification notes and supplementary units {r}',"
        "'{c}.{d}%','XI legacy {e}.{f}%')".format(
            i=i, code=code,
            a=i * 7 % 25, b=i % 10, r=i % 97,
            c=i * 3 % 25, d=(i + 5) % 10,
            e=i * 11 % 40, f=i % 5,
        )
    )
payload = ('INSERT INTO tariffs VALUES\n' + ',\n'.join(rows) + ';\n').encode('utf-8')

blob = zstandard.ZstdCompressor(level=15).compress(payload)
with open(os.path.join(HERE, 'snapshot-fixture.db.zst'), 'wb') as fh:
    fh.write(blob)


def sha(data: bytes) -> str:
    return 'sha256:' + hashlib.sha256(data).hexdigest()


print(json.dumps({
    'raw_size': len(payload),
    'raw_hash': sha(payload),
    'zst_size': len(blob),
    'zst_hash': sha(blob),
}))
