import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import type { HonoEnv } from "../../routes/app";
import { DataSetService } from "../../datasets/dataset.service";
import { NotFoundError } from "../../shared/errors";
import { ManageResolver } from "./resolve";
import { serializeDataSet } from "./serializers";
import {
  DataSetSchema,
  MANAGE_TAG,
  RecordsBodySchema,
  SlugOrId,
  conflictResponse,
  errorResponses,
  jsonBody,
  jsonContent,
  manageSecurity,
  notFoundResponse,
} from "./schemas";

const dataSetParams = z.object({ project: SlugOrId, dataset: SlugOrId });

export class ManageCreateDataSet extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Create a dataset",
    description: "The slug is made from the name. A repeat with the same name returns 409, so it is safe to retry.",
    security: manageSecurity,
    request: {
      params: z.object({ project: SlugOrId }),
      body: jsonBody(z.object({ name: z.string().trim().min(1).max(200) })),
    },
    responses: {
      "201": jsonContent(z.object({ dataset: DataSetSchema }), "The new dataset"),
      ...errorResponses,
      ...notFoundResponse,
      ...conflictResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, body } = await this.getValidatedData<typeof this.schema>();
    const { projectId } = await new ManageResolver(c).project(params.project);
    const dataSet = await new DataSetService(c.env.DB).createDataSet(
      { tenantId: projectId.tenantId, projectId: projectId.id },
      { name: body.name }
    );
    return c.json({ dataset: serializeDataSet(dataSet) }, 201);
  }
}

export class ManageGetDataSet extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Get a dataset",
    security: manageSecurity,
    request: { params: dataSetParams },
    responses: {
      "200": jsonContent(z.object({ dataset: DataSetSchema }), "The dataset with its record count and variable schema"),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const resolver = new ManageResolver(c);
    const { projectId } = await resolver.project(params.project);
    const { dataSet } = await resolver.dataSet(projectId, params.dataset);
    return c.json({ dataset: serializeDataSet(dataSet) });
  }
}

export class ManageAddRecords extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Add records to a dataset",
    description: [
      "Each record is an object of variables that fill the {{placeholders}} of a prompt.",
      "All records of one call are saved together or not at all.",
      "NOT safe to retry blindly: a repeat adds the same records again. After a timeout, read the dataset's countOfRecords first and retry only if it did not grow.",
    ].join(" "),
    security: manageSecurity,
    request: { params: dataSetParams, body: jsonBody(RecordsBodySchema) },
    responses: {
      "201": jsonContent(
        z.object({ dataset: DataSetSchema, recordIds: z.array(z.number()) }),
        "The dataset after the insert and the ids of the new records"
      ),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, body } = await this.getValidatedData<typeof this.schema>();
    const resolver = new ManageResolver(c);
    const { projectId } = await resolver.project(params.project);
    const { dataSetId } = await resolver.dataSet(projectId, params.dataset);

    const service = new DataSetService(c.env.DB);
    const records = await service.createDataSetRecords(dataSetId, body.records);
    const dataSet = await service.getDataSetById(dataSetId);
    if (!dataSet) {
      throw new NotFoundError("Dataset not found");
    }

    return c.json({ dataset: serializeDataSet(dataSet), recordIds: records.map((record) => record.id) }, 201);
  }
}
