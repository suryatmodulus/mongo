/**
 *    Copyright (C) 2018-present MongoDB, Inc.
 *
 *    This program is free software: you can redistribute it and/or modify
 *    it under the terms of the Server Side Public License, version 1,
 *    as published by MongoDB, Inc.
 *
 *    This program is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    Server Side Public License for more details.
 *
 *    You should have received a copy of the Server Side Public License
 *    along with this program. If not, see
 *    <http://www.mongodb.com/licensing/server-side-public-license>.
 *
 *    As a special exception, the copyright holders give permission to link the
 *    code of portions of this program with the OpenSSL library under certain
 *    conditions as described in each individual source file and distribute
 *    linked combinations including the program with the OpenSSL library. You
 *    must comply with the Server Side Public License in all respects for
 *    all of the code used other than as permitted herein. If you modify file(s)
 *    with this exception, you may extend this exception to your version of the
 *    file(s), but you are not obligated to do so. If you do not wish to do so,
 *    delete this exception statement from your version. If you delete this
 *    exception statement from all source files in the program, then also delete
 *    it in the license file.
 */

#include "mongo/platform/basic.h"

#include "mongo/db/matcher/expression_where.h"

#include <memory>

#include "mongo/base/init.h"
#include "mongo/db/auth/authorization_session.h"
#include "mongo/db/client.h"
#include "mongo/db/jsobj.h"
#include "mongo/db/matcher/expression.h"
#include "mongo/db/matcher/expression_parser.h"
#include "mongo/db/namespace_string.h"
#include "mongo/db/query/query_knobs_gen.h"
#include "mongo/scripting/engine.h"
#include "mongo/util/scopeguard.h"


namespace mongo {

using std::unique_ptr;

WhereMatchExpression::WhereMatchExpression(OperationContext* opCtx,
                                           WhereParams params,
                                           StringData dbName)
    : WhereMatchExpressionBase(std::move(params)),
      _dbName(dbName.toString()),
      _opCtx(opCtx),
      _jsFunction(_opCtx, getCode(), _dbName) {}

bool WhereMatchExpression::matches(const MatchableDocument* doc, MatchDetails* details) const {
    return _jsFunction.runAsPredicate(doc->toBSON());
}

unique_ptr<MatchExpression> WhereMatchExpression::shallowClone() const {
    WhereParams params;
    params.code = getCode();
    unique_ptr<WhereMatchExpression> e =
        std::make_unique<WhereMatchExpression>(_opCtx, std::move(params), _dbName);
    if (getTag()) {
        e->setTag(getTag()->clone());
    }
    if (getInputParamId()) {
        e->setInputParamId(*getInputParamId());
    }
    return e;
}
}  // namespace mongo
