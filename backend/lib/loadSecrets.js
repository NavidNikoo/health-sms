/**
 * Load secrets from AWS SSM Parameter Store into process.env.
 *
 * Only runs when AWS_SSM_PREFIX is set (e.g. /health-sms/prod/).
 * This replaces the need for a .env file on production servers.
 *
 * Parameters must exist as SecureString in SSM. A parameter named
 * /health-sms/prod/PGPASSWORD becomes process.env.PGPASSWORD.
 *
 * IAM requirement: the EC2 instance role needs:
 *   ssm:GetParametersByPath on arn:aws:ssm:<region>:<account>:parameter/health-sms/prod/*
 *   kms:Decrypt on the KMS key used to encrypt the SecureStrings
 */

const { SSMClient, GetParametersByPathCommand } = require("@aws-sdk/client-ssm");

async function loadSecrets() {
  const prefix = process.env.AWS_SSM_PREFIX;
  if (!prefix) return;

  const region = process.env.AWS_REGION || "us-east-1";
  const client = new SSMClient({ region });

  let nextToken;
  let loaded = 0;

  do {
    const cmd = new GetParametersByPathCommand({
      Path: prefix,
      WithDecryption: true,
      Recursive: false,
      ...(nextToken ? { NextToken: nextToken } : {}),
    });

    const response = await client.send(cmd);

    for (const param of response.Parameters || []) {
      // Strip prefix to get the bare env key name.
      // /health-sms/prod/PGPASSWORD -> PGPASSWORD
      const key = param.Name.slice(prefix.endsWith("/") ? prefix.length : prefix.length + 1);
      if (key && param.Value !== undefined) {
        process.env[key] = param.Value;
        loaded++;
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  console.log(`[loadSecrets] Loaded ${loaded} secret(s) from SSM prefix "${prefix}"`);
}

module.exports = { loadSecrets };
