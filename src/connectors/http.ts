import HTTP from 'http'
import HTTPS from 'https'

type TCommonRecord = Record<string, string | number | boolean>

export type THttpRequestOptions = {
    url: string | URL;
    method?: 'GET' | 'POST';
    header?: TCommonRecord;
    data?: TCommonRecord | string;
    dataType?: 'json' | 'form' | 'formdata'
}

const isInvalidValue = (v: any): v is null | undefined => v === null || typeof v === 'undefined'
const isRecord = (v: any): v is TCommonRecord => Object.prototype.toString.call(v) === '[object Object]'

const HEADERS = {
    'accept': '*/*',
    'connection': 'keep-alive',
}

const HEADERS_STATIC = {
    'user-agent': 'AnyConn/0.0.1',
}

const formatHeader = (v: any): Record<string, string> => {
    const h: Record<string, string> = { ...HEADERS }
    if (isRecord(v)) {
        Object.entries(v).forEach(([k, v]) => {
            if (!isInvalidValue(v)) {
                h[k] = v.toString()
            }
        })
    }
    return { ...h, ...HEADERS_STATIC }
}

const getContentType = (ct: any) => {
    if (!ct || typeof ct !== 'string') {
        return {
            type: 'text',
            format: 'plain',
            charset: 'utf-8' as BufferEncoding
        }
    } else {
        const [t, ch] = ct.toLowerCase().split(/\;\s*/)
        let charset: BufferEncoding = 'utf-8'
        if (ch && /^charset\=.+$/i.test(ch)) {
            const m = ch.match(/^charset\=(.+)$/)
            if (m && m[1]) {
                charset = m[1] as BufferEncoding
            }
        }
        const [type, format] = t.split(/\/+/)
        return { type, format, charset }
    }
}

const request = <T = any>(options: THttpRequestOptions) => new Promise<{
    statusCode: number;
    data: T;
    headers: any;
}>((resolve, reject) => {
    const {
        url,
        method = 'GET',
        header,
        data,
        dataType = 'json'
    } = options

    const uri = typeof url === 'string' ? new URL(url) : url
    const H = uri.protocol === 'https:' ? HTTPS : HTTP

    let body = Buffer.from([])
    const headers = formatHeader(header)

    if (isRecord(data)) {
        if (method === 'GET') {
            Object.entries(data).forEach(([key, val]) => {
                if (!isInvalidValue(val)) {
                    uri.searchParams.set(key, val.toString())
                }
            })
        } else if (method === 'POST') {
            const { ['content-type']: contentType = 'application/json' } = headers
            const ct = getContentType(contentType)
            // application/json
            // if ((ct.type === 'application' || ct.type === 'type') && ct.format === 'json') {
            if (dataType === 'json') {
                body = Buffer.from(JSON.stringify(data))
                headers['content-type'] = 'application/json'
            }
            // application/x-www-form-urlencoded
            // else if (ct.type === 'application' && ct.format === 'x-www-form-urlencoded') {
            else if (dataType === 'form') {
                body = Buffer.from(Object.keys(data).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(data[k])}`).join('&'))
                headers['content-type'] = 'application/x-www-form-urlencoded'
            }
            // multipart/form-data
            // else if (ct.type === 'multipart' && ct.format === 'form-data') {
            else if (dataType === 'formdata') {
                const boundary = `AnyConn${Date.now().toString(36)}${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`
                const dataStr = ''
                    + Object.entries(data).map(([key, val]) => {
                        return (
                            `--${boundary}\n` +
                            `Content-Disposition: form-data; name="${key}"\n\n` +
                            `${val}\n`
                        )
                    }).join('')
                    + `--${boundary}--`
                console.log({ dataStr })
                body = Buffer.from(dataStr)
                headers['content-type'] = `multipart/form-data; boundary=${boundary}`
            }
        }
    }

    const req = H.request(uri.toString(), {
        method,
        headers,
    }, res => {

        const chunks: Buffer[] = []

        res.on('data', data => {
            chunks.push(data)
        })

        res.on('error', err => {
            reject(err)
        })

        res.on('end', () => {
            const data = Buffer.concat(chunks)
            const { ['content-type']: contentType } = res.headers
            const t = getContentType(contentType)

            if (t.format === 'json') {
                resolve({
                    data: JSON.parse(data.toString(t.charset)) as T,
                    statusCode: res.statusCode || 0,
                    headers: res.headers,
                })
            } else if (t.type === 'text') {
                resolve({
                    data: data.toString(t.charset) as T,
                    statusCode: res.statusCode || 0,
                    headers: res.headers,
                })
            } else {
                resolve({
                    data: data as T,
                    statusCode: res.statusCode || 0,
                    headers: res.headers,
                })
            }
        })
    })


    req.on('error', err => {
        reject(err)
    })

    if (body.length > 0) {
        req.write(body, err => {
            if (err) {
                reject(err)
            } else {
                req.end()
            }
        })
    } else {
        req.end()
    }
})

export default <T = any>(options: THttpRequestOptions | string) => {
    if (typeof options === 'string') {
        return request<T>({ url: options })
    } else {
        return request<T>(options)
    }
}